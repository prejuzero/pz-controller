import { Inject, Injectable } from '@nestjs/common';
import { publicarPendentes } from '@pz/kernel';
import { criarLogger, executarNoContextoPropagado, registrarErro } from '@pz/observability';

import { AMBIENTE, FILAS_RUNTIME, FONTE_DO_RELAY, RELOGIO, UNIDADE_DO_RELAY } from '../fichas.js';
import { Filas } from '../filas/runtime.js';

import { DespachanteDeEventos } from './consome.js';
import { consumirEvento, serializarEvento } from './job-evento.js';

import type { AmbienteWorker } from '../ambiente.js';
import type { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import type { EventoReservado } from '@pz/db';
import type {
  Clock,
  EventoDominio,
  FilaDoRelay,
  Instant,
  UnidadeDeTrabalho,
  Uuid,
} from '@pz/kernel';
import type { ContextoPropagavel } from '@pz/observability';

const logger = criarLogger('worker.relay');
const LOTE = 100;

/** Origem dos eventos pendentes: o outbox do PostgreSQL (ou um equivalente em memória nos testes). */
export interface FonteDoRelay<Transacao> {
  reservarPendentesComContexto(
    transacao: Transacao,
    limite: number,
  ): Promise<readonly EventoReservado[]>;
  marcarPublicados(transacao: Transacao, ids: readonly Uuid[], em: Instant): Promise<void>;
}

/**
 * Relay do outbox (ADR-004): a cada ciclo reserva os eventos pendentes (como sistema, com
 * `FOR UPDATE SKIP LOCKED`, então réplicas concorrentes não pegam o mesmo evento) e publica na
 * fila `eventos` um job por consumidor inscrito, no contexto de trace gravado com o evento.
 * Entrega pelo menos uma vez: se cair depois de publicar, o ID determinístico do job e a
 * deduplicação por consumidor impedem efeito duplicado. Roda nas instâncias que processam `eventos`.
 */
@Injectable()
export class RelayDoOutbox implements OnApplicationBootstrap, OnApplicationShutdown {
  #temporizador: NodeJS.Timeout | undefined;
  #ciclo: Promise<number> | undefined;

  constructor(
    @Inject(AMBIENTE) private readonly ambiente: AmbienteWorker,
    @Inject(UNIDADE_DO_RELAY) private readonly unidade: UnidadeDeTrabalho<unknown>,
    @Inject(FONTE_DO_RELAY) private readonly fonte: FonteDoRelay<unknown>,
    @Inject(RELOGIO) private readonly relogio: Clock,
    @Inject(DespachanteDeEventos) private readonly despachante: DespachanteDeEventos,
    @Inject(FILAS_RUNTIME) private readonly filas: Filas,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.filas.filasAtivas().includes('eventos')) return;
    this.#temporizador = setInterval(() => {
      void this.executarCiclo();
    }, this.ambiente.RELAY_INTERVALO_MS);
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.#temporizador);
    await this.#ciclo;
  }

  /** Um ciclo: publica até um lote. Falha vira log, métrica e alerta, e o lote volta ao outbox. */
  async executarCiclo(): Promise<number> {
    if (this.#ciclo !== undefined) return 0;
    const contextos = new Map<string, ContextoPropagavel>();
    const fila: FilaDoRelay<unknown> = {
      reservarPendentes: async (transacao, limite) => {
        const reservados = await this.fonte.reservarPendentesComContexto(transacao, limite);
        for (const { evento, contexto } of reservados) contextos.set(evento.id, contexto);
        return reservados.map((item) => item.evento);
      },
      marcarPublicados: (transacao, ids, em) => this.fonte.marcarPublicados(transacao, ids, em),
    };
    const publicar = async (evento: EventoDominio) => {
      for (const consumidor of this.despachante.consumidoresDe(evento)) {
        await executarNoContextoPropagado(contextos.get(evento.id) ?? {}, () =>
          this.filas.publicar(
            consumirEvento,
            { consumidor, evento: serializarEvento(evento) },
            { tenantId: evento.tenantId },
            `${consumidor}:${evento.id}`,
          ),
        );
      }
    };
    this.#ciclo = publicarPendentes(this.unidade, fila, publicar, this.relogio, LOTE);
    try {
      const publicados = await this.#ciclo;
      if (publicados > 0) logger.debug({ publicados }, 'eventos publicados nas filas');
      return publicados;
    } catch (erro) {
      registrarErro(logger, erro, 'falha no ciclo do relay do outbox', 'worker.relay');
      return 0;
    } finally {
      this.#ciclo = undefined;
    }
  }
}
