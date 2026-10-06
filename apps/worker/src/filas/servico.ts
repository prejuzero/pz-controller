import { Inject, Injectable } from '@nestjs/common';
import { registrarSituacaoDasFilas } from '@pz/observability';

import { FILAS_RUNTIME, REDIS } from '../fichas.js';

import { Filas } from './runtime.js';

import type { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import type { Redis } from 'ioredis';

/**
 * Ciclo de vida das filas no worker: começa a consumir no boot, publica a situação das filas
 * (profundidade, idade do mais antigo, DLQ) para as métricas e alertas, e no desligamento espera
 * os jobs em andamento terminarem antes de fechar a conexão.
 */
@Injectable()
export class ServicoDeFilas implements OnApplicationBootstrap, OnApplicationShutdown {
  #cancelarMetricas: (() => void) | undefined;

  constructor(
    @Inject(FILAS_RUNTIME) private readonly filas: Filas,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  onApplicationBootstrap(): void {
    this.filas.iniciar();
    this.#cancelarMetricas = registrarSituacaoDasFilas(() => this.filas.situacao());
  }

  async onApplicationShutdown(): Promise<void> {
    this.#cancelarMetricas?.();
    await this.filas.encerrar();
    // quit educado com o Redis no ar; disconnect se ele não responder.
    await Promise.race([
      this.redis.quit().catch(() => undefined),
      new Promise((resolver) => setTimeout(resolver, 2_000)),
    ]);
    this.redis.disconnect();
  }
}
