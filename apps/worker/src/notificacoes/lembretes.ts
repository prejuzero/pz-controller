import { Inject, Injectable } from '@nestjs/common';
import { AvisarNovaIntimacao, CancelarLembretes, ProgramarLembretes } from '@pz/notificacoes';
import { criarLogger } from '@pz/observability';
import { z } from 'zod';

import { Consome } from '../eventos/consome.js';

import type { Transacao } from '@pz/db';
import type { EventoDominio, Uuid } from '@pz/kernel';
import type { RepositorioDeLembretes } from '@pz/notificacoes';

const logger = criarLogger('notificacoes.lembretes');
const DoPrazo = z.object({ prazoId: z.uuid() });
const Sugerido = DoPrazo.extend({ origem: z.enum(['djen', 'manual', 'painel']) });

export const REPOSITORIO_DE_LEMBRETES = Symbol('REPOSITORIO_DE_LEMBRETES');

/**
 * Liga os lembretes aos eventos do prazo (HU31): programa no sugerido, confirmado, ajustado e
 * recalculado; cancela no cumprido, cancelado e vencido; reprograma quando a preferência muda.
 * Idempotente: reprocessar regrava a mesma agenda. Sem regra aqui.
 */
@Injectable()
export class ConsumidorDosLembretes {
  constructor(
    @Inject(ProgramarLembretes) private readonly programar: ProgramarLembretes<Transacao>,
    @Inject(CancelarLembretes) private readonly cancelar: CancelarLembretes<Transacao>,
    @Inject(AvisarNovaIntimacao) private readonly avisar: AvisarNovaIntimacao<Transacao>,
    @Inject(REPOSITORIO_DE_LEMBRETES)
    private readonly lembretes: RepositorioDeLembretes<Transacao>,
  ) {}

  @Consome('PrazoSugerido', { versao: 1 })
  async sugerido(tx: Transacao, evento: EventoDominio): Promise<void> {
    const { prazoId, origem } = Sugerido.parse(evento.payload);
    await this.#programar(tx, evento, prazoId as Uuid);
    const aviso = await this.avisar.executar(tx, {
      tenantId: evento.tenantId,
      prazoId: prazoId as Uuid,
      origem,
    });
    logger.info({ prazoId, aviso }, 'nova intimação');
  }

  @Consome('PrazoConfirmado', { versao: 1 })
  confirmado(tx: Transacao, evento: EventoDominio): Promise<void> {
    return this.#programar(tx, evento, DoPrazo.parse(evento.payload).prazoId as Uuid);
  }

  @Consome('PrazoAjustado', { versao: 1 })
  ajustado(tx: Transacao, evento: EventoDominio): Promise<void> {
    return this.#programar(tx, evento, DoPrazo.parse(evento.payload).prazoId as Uuid);
  }

  @Consome('PrazoRecalculado', { versao: 1 })
  recalculado(tx: Transacao, evento: EventoDominio): Promise<void> {
    return this.#programar(tx, evento, DoPrazo.parse(evento.payload).prazoId as Uuid);
  }

  @Consome('PrazoCumprido', { versao: 1 })
  cumprido(tx: Transacao, evento: EventoDominio): Promise<void> {
    return this.#cancelar(tx, evento);
  }

  @Consome('PrazoCancelado', { versao: 1 })
  cancelado(tx: Transacao, evento: EventoDominio): Promise<void> {
    return this.#cancelar(tx, evento);
  }

  @Consome('PreferenciasDeNotificacaoAlteradas', { versao: 1 })
  async preferencias(tx: Transacao, evento: EventoDominio): Promise<void> {
    const { usuarioId } = z.object({ usuarioId: z.uuid() }).parse(evento.payload);
    const prazos = await this.lembretes.prazosDoUsuario(tx, usuarioId as Uuid);
    for (const prazoId of prazos) await this.#programar(tx, evento, prazoId);
    logger.info({ usuarioId, prazos: prazos.length }, 'lembretes reprogramados pela preferência');
  }

  async #programar(tx: Transacao, evento: EventoDominio, prazoId: Uuid): Promise<void> {
    const { agendados } = await this.programar.executar(tx, evento.tenantId, prazoId);
    logger.info({ prazoId, agendados, evento: evento.tipo }, 'lembretes programados');
  }

  async #cancelar(tx: Transacao, evento: EventoDominio): Promise<void> {
    const prazoId = DoPrazo.parse(evento.payload).prazoId as Uuid;
    const cancelados = await this.cancelar.executar(tx, prazoId);
    logger.info({ prazoId, cancelados, evento: evento.tipo }, 'lembretes cancelados');
  }
}
