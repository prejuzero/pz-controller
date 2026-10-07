import { Inject, Injectable } from '@nestjs/common';
import { EnviarAvisosDeSeguranca } from '@pz/identidade';

import { Consome } from '../eventos/consome.js';

import type { Transacao } from '@pz/db';
import type { EventoDominio, Uuid } from '@pz/kernel';

/** Liga os e-mails de segurança da identidade aos eventos (HU06). Sem regra aqui. */
@Injectable()
export class ConsumidorDeAvisosDeIdentidade {
  constructor(
    @Inject(EnviarAvisosDeSeguranca)
    private readonly avisos: EnviarAvisosDeSeguranca<Transacao>,
  ) {}

  @Consome('RedefinicaoDeSenhaSolicitada', { versao: 1 })
  redefinicao(
    transacao: Transacao,
    evento: EventoDominio<
      'RedefinicaoDeSenhaSolicitada',
      { usuarioId: Uuid; tokenCifrado: string }
    >,
  ): Promise<void> {
    return this.avisos.redefinicaoSolicitada(transacao, evento);
  }

  @Consome('VerificacaoDeEmailSolicitada', { versao: 1 })
  verificacaoDeEmail(
    transacao: Transacao,
    evento: EventoDominio<
      'VerificacaoDeEmailSolicitada',
      { usuarioId: Uuid; tokenCifrado: string }
    >,
  ): Promise<void> {
    return this.avisos.verificacaoDeEmailSolicitada(transacao, evento);
  }

  @Consome('ContaBloqueada', { versao: 1 })
  bloqueio(
    transacao: Transacao,
    evento: EventoDominio<
      'ContaBloqueada',
      { usuarioId: Uuid; motivo: 'login' | 'segundo-fator'; bloqueadaAte: string }
    >,
  ): Promise<void> {
    return this.avisos.contaBloqueada(transacao, evento);
  }
}
