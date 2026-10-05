import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { SystemClock } from '@pz/kernel';
import { ConsultarSituacao, VerificadorHttp, VerificadorTcp } from '@pz/saude';

import { AMBIENTE, RELOGIO, VERIFICADORES } from './fichas.js';
import { GuardaDeAcesso } from './http/acesso.js';
import { FiltroDeProblemas } from './http/problemas.js';
import { OpenApiController } from './openapi.controller.js';
import { SaudeController, SondasController } from './saude/saude.controller.js';

import type { AmbienteApi } from './ambiente.js';
import type { DynamicModule, Provider, Type } from '@nestjs/common';
import type { Clock } from '@pz/kernel';
import type { VerificadorDeDependencia } from '@pz/saude';

export interface OpcoesApi {
  readonly ambiente: AmbienteApi;
  /** Substituições para testes (ex.: relógio fixo, verificadores falsos). */
  readonly relogio?: Clock;
  readonly verificadores?: readonly VerificadorDeDependencia[];
  readonly controllersExtras?: readonly Type[];
}

/** Dependências que /health/ready e /v1/saude conferem (ADR-010). */
function verificadoresDoAmbiente(ambiente: AmbienteApi): VerificadorDeDependencia[] {
  return [
    new VerificadorTcp('banco', ambiente.DATABASE_URL),
    new VerificadorTcp('redis', ambiente.REDIS_URL),
    ...(ambiente.S3_ENDPOINT === undefined
      ? []
      : [new VerificadorHttp('armazenamento', ambiente.S3_ENDPOINT)]),
  ];
}

/**
 * Composição da api (CLAUDE.md, seção 6): só liga módulos, controllers e infraestrutura HTTP.
 * Módulos entram por lista explícita.
 */
@Module({})
export class AppModule {
  static registrar(opcoes: OpcoesApi): DynamicModule {
    const provedores: Provider[] = [
      { provide: AMBIENTE, useValue: opcoes.ambiente },
      { provide: RELOGIO, useValue: opcoes.relogio ?? new SystemClock() },
      {
        provide: VERIFICADORES,
        useValue: opcoes.verificadores ?? verificadoresDoAmbiente(opcoes.ambiente),
      },
      {
        provide: ConsultarSituacao,
        inject: [VERIFICADORES, RELOGIO],
        useFactory: (verificadores: VerificadorDeDependencia[], relogio: Clock) =>
          new ConsultarSituacao(verificadores, relogio, opcoes.ambiente.VERSAO),
      },
      { provide: APP_GUARD, useClass: GuardaDeAcesso },
      { provide: APP_FILTER, useClass: FiltroDeProblemas },
    ];
    return {
      module: AppModule,
      controllers: [
        SaudeController,
        SondasController,
        OpenApiController,
        ...(opcoes.controllersExtras ?? []),
      ],
      providers: provedores,
    };
  }
}
