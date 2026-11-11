import { Inject, Injectable } from '@nestjs/common';
import { RegistrarIndicioDeCiencia } from '@pz/ciencia';
import { criarLogger } from '@pz/observability';
import { RegistrarCienciaNoPrazo } from '@pz/prazos';
import { z } from 'zod';

import { Consome } from '../eventos/consome.js';

import type { Transacao } from '@pz/db';
import type { EventoDominio, Uuid } from '@pz/kernel';

const logger = criarLogger('ciencia');
const DoPrazo = z.object({ prazoId: z.uuid() });
const DaEntrega = z.object({ prazoId: z.uuid().optional() });

/**
 * Liga a ciência aos eventos (HU33): a confirmação vira o espelho no prazo; a entrega e a
 * abertura do e-mail e o cumprimento só avançam o estado (indícios). Idempotente. Sem regra aqui.
 */
@Injectable()
export class ConsumidorDaCiencia {
  constructor(
    @Inject(RegistrarCienciaNoPrazo) private readonly noPrazo: RegistrarCienciaNoPrazo<Transacao>,
    @Inject(RegistrarIndicioDeCiencia)
    private readonly indicio: RegistrarIndicioDeCiencia<Transacao>,
  ) {}

  @Consome('CienciaConfirmada', { versao: 1 })
  async confirmada(tx: Transacao, evento: EventoDominio): Promise<void> {
    const prazoId = DoPrazo.parse(evento.payload).prazoId as Uuid;
    logger.info(
      { prazoId, resultado: await this.noPrazo.executar(tx, prazoId) },
      'ciência no prazo',
    );
  }

  @Consome('NotificacaoEntregue', { versao: 1 })
  async entregue(tx: Transacao, evento: EventoDominio): Promise<void> {
    const { prazoId } = DaEntrega.parse(evento.payload);
    if (prazoId === undefined) return;
    await this.indicio.executar(tx, {
      tenantId: evento.tenantId,
      prazoId: prazoId as Uuid,
      estado: 'entregue',
    });
  }

  @Consome('NotificacaoAberta', { versao: 1 })
  async aberta(tx: Transacao, evento: EventoDominio): Promise<void> {
    const { prazoId } = DaEntrega.parse(evento.payload);
    if (prazoId === undefined) return;
    await this.indicio.executar(tx, {
      tenantId: evento.tenantId,
      prazoId: prazoId as Uuid,
      estado: 'aberto',
    });
  }

  @Consome('PrazoCumprido', { versao: 1 })
  async cumprido(tx: Transacao, evento: EventoDominio): Promise<void> {
    await this.indicio.executar(tx, {
      tenantId: evento.tenantId,
      prazoId: DoPrazo.parse(evento.payload).prazoId as Uuid,
      estado: 'cumprido',
    });
  }
}
