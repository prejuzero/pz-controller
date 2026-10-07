import { Inject, Injectable } from '@nestjs/common';
import { EnviarNotificacao } from '@pz/notificacoes';

import { Consome } from '../eventos/consome.js';

import type { Transacao } from '@pz/db';
import type { NotificacaoSolicitada } from '@pz/notificacoes';

/** Liga o envio das notificações ao evento (HU30). Sem regra aqui. */
@Injectable()
export class ConsumidorDeNotificacoes {
  constructor(@Inject(EnviarNotificacao) private readonly enviar: EnviarNotificacao<Transacao>) {}

  @Consome('NotificacaoSolicitada', { versao: 1 })
  solicitada(transacao: Transacao, evento: NotificacaoSolicitada): Promise<void> {
    return this.enviar.executar(transacao, evento.payload.notificacaoId);
  }
}
