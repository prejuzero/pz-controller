import { Inject, Injectable } from '@nestjs/common';
import { publicarPendentes } from '@pz/kernel';
import { criarLogger, registrarErro } from '@pz/observability';

import { AMBIENTE, FILA_DO_RELAY, RELOGIO, UNIDADE_DE_TRABALHO } from '../fichas.js';

import { DespachanteDeEventos } from './consome.js';

import type { AmbienteWorker } from '../ambiente.js';
import type { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import type { Clock, FilaDoRelay, UnidadeDeTrabalho } from '@pz/kernel';

const logger = criarLogger('worker.relay');
const LOTE = 100;

/**
 * Relay do outbox (ADR-004): a cada ciclo publica os eventos pendentes aos consumidores.
 * Até a HU10 a entrega é no próprio processo; a HU10 troca por publicação nas filas BullMQ,
 * com `FOR UPDATE SKIP LOCKED` sobre a tabela da HU05.
 */
@Injectable()
export class RelayDoOutbox implements OnApplicationBootstrap, OnApplicationShutdown {
  #temporizador: NodeJS.Timeout | undefined;
  #ciclo: Promise<number> | undefined;

  constructor(
    @Inject(AMBIENTE) private readonly ambiente: AmbienteWorker,
    @Inject(UNIDADE_DE_TRABALHO) private readonly unidade: UnidadeDeTrabalho<unknown>,
    @Inject(FILA_DO_RELAY) private readonly fila: FilaDoRelay<unknown>,
    @Inject(RELOGIO) private readonly relogio: Clock,
    @Inject(DespachanteDeEventos) private readonly despachante: DespachanteDeEventos,
  ) {}

  onApplicationBootstrap(): void {
    this.#temporizador = setInterval(() => {
      void this.executarCiclo();
    }, this.ambiente.RELAY_INTERVALO_MS);
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.#temporizador);
    await this.#ciclo;
  }

  /** Um ciclo: publica até um lote. Falha vira log, métrica e alerta, e o lote volta à fila. */
  async executarCiclo(): Promise<number> {
    if (this.#ciclo !== undefined) return 0;
    this.#ciclo = publicarPendentes(
      this.unidade,
      this.fila,
      async (evento) => {
        await this.despachante.despachar(evento);
      },
      this.relogio,
      LOTE,
    );
    try {
      const publicados = await this.#ciclo;
      if (publicados > 0) logger.debug({ publicados }, 'eventos publicados');
      return publicados;
    } catch (erro) {
      registrarErro(logger, erro, 'falha no ciclo do relay do outbox', 'worker.relay');
      return 0;
    } finally {
      this.#ciclo = undefined;
    }
  }
}
