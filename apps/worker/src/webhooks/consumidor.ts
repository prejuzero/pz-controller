import { Inject, Injectable } from '@nestjs/common';
import { RegistrarEntregas } from '@pz/webhooks';
import { z } from 'zod';

import { Consome } from '../eventos/consome.js';
import { FILAS_RUNTIME } from '../fichas.js';

import { entregarWebhookJob } from './jobs.js';

import type { Filas } from '../filas/runtime.js';
import type { Transacao } from '@pz/db';
import type { EventoDominio, Uuid } from '@pz/kernel';

const Agendada = z.object({ entregaId: z.uuid() });

/**
 * Webhooks de saída (HU49): cada evento público vira uma entrega por assinatura do tenant, na
 * transação do consumo, e um job de envio por entrega (a chave evita job duplicado). Sem regra
 * aqui: o mapeamento e a idempotência são do módulo.
 */
@Injectable()
export class ConsumidorDosWebhooks {
  constructor(
    @Inject(RegistrarEntregas) private readonly registrar: RegistrarEntregas<Transacao>,
    @Inject(FILAS_RUNTIME) private readonly filas: Filas,
  ) {}

  @Consome('PrazoSugerido', { versao: 1 })
  prazoSugerido(tx: Transacao, evento: EventoDominio): Promise<void> {
    return this.#registrar(tx, evento);
  }

  @Consome('PrazoRecalculado', { versao: 1 })
  prazoRecalculado(tx: Transacao, evento: EventoDominio): Promise<void> {
    return this.#registrar(tx, evento);
  }

  @Consome('PrazoConfirmado', { versao: 1 })
  prazoConfirmado(tx: Transacao, evento: EventoDominio): Promise<void> {
    return this.#registrar(tx, evento);
  }

  @Consome('PrazoAjustado', { versao: 1 })
  prazoAjustado(tx: Transacao, evento: EventoDominio): Promise<void> {
    return this.#registrar(tx, evento);
  }

  @Consome('PrazoCumprido', { versao: 1 })
  prazoCumprido(tx: Transacao, evento: EventoDominio): Promise<void> {
    return this.#registrar(tx, evento);
  }

  @Consome('PrazoCancelado', { versao: 1 })
  prazoCancelado(tx: Transacao, evento: EventoDominio): Promise<void> {
    return this.#registrar(tx, evento);
  }

  @Consome('PrazoVencido', { versao: 1 })
  prazoVencido(tx: Transacao, evento: EventoDominio): Promise<void> {
    return this.#registrar(tx, evento);
  }

  @Consome('PublicacaoRecebida', { versao: 1 })
  publicacaoRecebida(tx: Transacao, evento: EventoDominio): Promise<void> {
    return this.#registrar(tx, evento);
  }

  @Consome('CienciaConfirmada', { versao: 1 })
  cienciaConfirmada(tx: Transacao, evento: EventoDominio): Promise<void> {
    return this.#registrar(tx, evento);
  }

  /** Teste e reenvio manual (portal): a entrega já existe; só agenda o envio. */
  @Consome('EntregaWebhookAgendada', { versao: 1 })
  async entregaAgendada(_tx: Transacao, evento: EventoDominio): Promise<void> {
    const { entregaId } = Agendada.parse(evento.payload);
    await this.#agendar(entregaId as Uuid, evento.tenantId, evento.id);
  }

  async #registrar(tx: Transacao, evento: EventoDominio): Promise<void> {
    for (const entregaId of await this.registrar.executar(tx, evento)) {
      await this.#agendar(entregaId, evento.tenantId, evento.id);
    }
  }

  #agendar(entregaId: Uuid, tenantId: Uuid, eventoId: string) {
    return this.filas.publicar(
      entregarWebhookJob,
      { entregaId, tenantId },
      { tenantId },
      `${entregaId}-${eventoId}`,
    );
  }
}
