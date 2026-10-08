import { Inject, Injectable } from '@nestjs/common';
import { AvisarSituacaoDaFonte, EnviarNotificacao } from '@pz/notificacoes';
import { criarLogger } from '@pz/observability';

import { Consome } from '../eventos/consome.js';

import type { Transacao } from '@pz/db';
import type { EventoDominio } from '@pz/kernel';
import type { NotificacaoSolicitada } from '@pz/notificacoes';

const logger = criarLogger('notificacoes');

type EventoDaFonte = EventoDominio<'FonteDegradada' | 'FonteRestabelecida', { fonte: string }>;

/** Liga o envio das notificações e os avisos da captura aos eventos (HU30, PZ-311). Sem regra aqui. */
@Injectable()
export class ConsumidorDeNotificacoes {
  constructor(
    @Inject(EnviarNotificacao) private readonly enviar: EnviarNotificacao<Transacao>,
    @Inject(AvisarSituacaoDaFonte) private readonly fonte: AvisarSituacaoDaFonte<Transacao>,
  ) {}

  @Consome('NotificacaoSolicitada', { versao: 1 })
  solicitada(transacao: Transacao, evento: NotificacaoSolicitada): Promise<void> {
    return this.enviar.executar(transacao, evento.payload.notificacaoId);
  }

  @Consome('FonteDegradada', { versao: 1 })
  fonteDegradada(transacao: Transacao, evento: EventoDaFonte): Promise<void> {
    return this.#avisar(transacao, evento, 'degradada');
  }

  @Consome('FonteRestabelecida', { versao: 1 })
  fonteRestabelecida(transacao: Transacao, evento: EventoDaFonte): Promise<void> {
    return this.#avisar(transacao, evento, 'restabelecida');
  }

  async #avisar(
    transacao: Transacao,
    evento: EventoDaFonte,
    situacao: 'degradada' | 'restabelecida',
  ): Promise<void> {
    const pedidos = await this.fonte.executar(transacao, {
      eventoId: evento.id,
      tenantId: evento.tenantId,
      fonte: evento.payload.fonte,
      situacao,
      ocorridoEm: evento.ocorridoEm,
    });
    // Nada falha em silêncio: escritório sem ninguém para avisar fica registrado.
    if (pedidos === 0)
      logger.warn(
        { tenantId: evento.tenantId, fonte: evento.payload.fonte, situacao },
        'situação da fonte sem destinatário para avisar',
      );
  }
}
