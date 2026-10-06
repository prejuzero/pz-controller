import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { OutboxEmMemoria, SystemClock } from '@pz/kernel';
import {
  ConsultarSituacao,
  HistoricoEmMemoria,
  RegistrarHistoricoDeSituacao,
  VerificadorHttp,
  VerificadorTcp,
} from '@pz/saude';
import { Redis } from 'ioredis';

import { DespachanteDeEventos } from './eventos/consome.js';
import { RelayDoOutbox } from './eventos/relay.js';
import {
  AMBIENTE,
  FILA_DO_RELAY,
  FILAS_RUNTIME,
  REDIS,
  REGISTRO_DE_PROCESSAMENTO,
  RELOGIO,
  UNIDADE_DE_TRABALHO,
  VERIFICADORES,
} from './fichas.js';
import { Filas } from './filas/runtime.js';
import { ServicoDeFilas } from './filas/servico.js';
import { ConsumidorDeSituacao } from './saude/consumidor.js';

import type { AmbienteWorker } from './ambiente.js';
import type { DynamicModule, Provider } from '@nestjs/common';
import type { Clock } from '@pz/kernel';
import type { VerificadorDeDependencia } from '@pz/saude';

export interface OpcoesWorker {
  readonly ambiente: AmbienteWorker;
  /** Substituições para testes. */
  readonly relogio?: Clock;
  readonly verificadores?: readonly VerificadorDeDependencia[];
  readonly outbox?: OutboxEmMemoria;
  /** false nos testes que não sobem Redis. Padrão: true. */
  readonly filas?: boolean;
}

function verificadoresDoAmbiente(
  ambiente: AmbienteWorker,
  redis: Redis,
): VerificadorDeDependencia[] {
  return [
    new VerificadorTcp('banco', ambiente.DATABASE_URL),
    // Redis no protocolo (PING), pela mesma conexão das filas.
    {
      nome: 'redis',
      verificar: async () => {
        await redis.ping(); // rejeita se o Redis não responder
      },
    },
    ...(ambiente.S3_ENDPOINT === undefined
      ? []
      : [new VerificadorHttp('armazenamento', ambiente.S3_ENDPOINT)]),
  ];
}

/** Composição do worker: consumidores de eventos (lista explícita) e relay do outbox. */
@Module({})
export class WorkerModule {
  static registrar(opcoes: OpcoesWorker): DynamicModule {
    const outbox = opcoes.outbox ?? new OutboxEmMemoria();
    // lazyConnect: só conecta quando usada; maxRetriesPerRequest null: exigência do BullMQ.
    const redis = new Redis(opcoes.ambiente.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
    const provedores: Provider[] = [
      { provide: REDIS, useValue: redis },
      { provide: AMBIENTE, useValue: opcoes.ambiente },
      { provide: RELOGIO, useValue: opcoes.relogio ?? new SystemClock() },
      {
        provide: VERIFICADORES,
        useValue: opcoes.verificadores ?? verificadoresDoAmbiente(opcoes.ambiente, redis),
      },
      { provide: UNIDADE_DE_TRABALHO, useValue: outbox },
      { provide: FILA_DO_RELAY, useValue: outbox },
      { provide: REGISTRO_DE_PROCESSAMENTO, useValue: outbox },
      {
        provide: ConsultarSituacao,
        inject: [VERIFICADORES, RELOGIO],
        useFactory: (verificadores: VerificadorDeDependencia[], relogio: Clock) =>
          new ConsultarSituacao(verificadores, relogio, opcoes.ambiente.VERSAO),
      },
      { provide: HistoricoEmMemoria, useValue: new HistoricoEmMemoria() },
      {
        provide: RegistrarHistoricoDeSituacao,
        inject: [HistoricoEmMemoria],
        useFactory: (historico: HistoricoEmMemoria) => new RegistrarHistoricoDeSituacao(historico),
      },
      {
        provide: FILAS_RUNTIME,
        inject: [RELOGIO],
        useFactory: (relogio: Clock) =>
          new Filas({ redis, relogio, filasAtivas: opcoes.ambiente.WORKER_QUEUES }),
      },
      ...(opcoes.filas === false ? [] : [ServicoDeFilas]),
      DespachanteDeEventos,
      RelayDoOutbox,
      // Consumidores (lista explícita, CLAUDE.md seção 6).
      ConsumidorDeSituacao,
    ];
    return { module: WorkerModule, imports: [DiscoveryModule], providers: provedores };
  }
}
