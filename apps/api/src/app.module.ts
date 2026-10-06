import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Banco, WebhooksPostgres } from '@pz/db';
import { SystemClock } from '@pz/kernel';
import { ConsultarSituacao, VerificadorHttp, VerificadorTcp } from '@pz/saude';

import {
  AMBIENTE,
  CAIXA_DE_WEBHOOKS,
  RECEPTORES_DE_WEBHOOK,
  RELOGIO,
  VERIFICADORES,
} from './fichas.js';
import { GuardaDeAcesso } from './http/acesso.js';
import { FiltroDeProblemas } from './http/problemas.js';
import { OpenApiController } from './openapi.controller.js';
import { SaudeController, SondasController } from './saude/saude.controller.js';
import { WebhooksController } from './webhooks/webhooks.controller.js';

import type { AmbienteApi } from './ambiente.js';
import type { CaixaDeWebhooks } from './webhooks/webhooks.controller.js';
import type { DynamicModule, Provider, Type } from '@nestjs/common';
import type { ReceptorWebhook } from '@pz/integracoes';
import type { Clock } from '@pz/kernel';
import type { VerificadorDeDependencia } from '@pz/saude';

export interface OpcoesApi {
  readonly ambiente: AmbienteApi;
  /** Substituições para testes (ex.: relógio fixo, verificadores falsos). */
  readonly relogio?: Clock;
  readonly verificadores?: readonly VerificadorDeDependencia[];
  readonly controllersExtras?: readonly Type[];
  readonly caixaDeWebhooks?: CaixaDeWebhooks;
  /** Receptores por ID do adaptador; cada adaptador com webhook entra aqui (HU30 em diante). */
  readonly receptoresDeWebhook?: ReadonlyMap<string, ReceptorWebhook>;
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

/** Webhook gravado sem tenant (ainda desconhecido), como pz_app: só INSERT na tabela global. */
function caixaPostgres(
  ambiente: AmbienteApi,
): CaixaDeWebhooks & { onApplicationShutdown(): Promise<void> } {
  const banco = new Banco({ url: ambiente.DATABASE_URL });
  const webhooks = new WebhooksPostgres();
  return {
    gravar: (webhook) =>
      banco.executarSemTenant('webhook de entrada', (tx) => webhooks.gravar(tx, webhook)),
    // O Nest chama no desligamento (também em provedores criados por fábrica).
    onApplicationShutdown: () => banco.encerrar(),
  };
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
      {
        provide: CAIXA_DE_WEBHOOKS,
        useFactory: () => opcoes.caixaDeWebhooks ?? caixaPostgres(opcoes.ambiente),
      },
      { provide: RECEPTORES_DE_WEBHOOK, useValue: opcoes.receptoresDeWebhook ?? new Map() },
      { provide: APP_GUARD, useClass: GuardaDeAcesso },
      { provide: APP_FILTER, useClass: FiltroDeProblemas },
    ];
    return {
      module: AppModule,
      controllers: [
        SaudeController,
        SondasController,
        OpenApiController,
        WebhooksController,
        ...(opcoes.controllersExtras ?? []),
      ],
      providers: provedores,
    };
  }
}
