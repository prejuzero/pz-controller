import { Inject, Injectable } from '@nestjs/common';
import { AuditarEvento } from '@pz/auditoria';

import { Consome } from '../eventos/consome.js';

import type { Transacao } from '@pz/db';
import type { EventoDominio } from '@pz/kernel';

/** Leva à trilha de auditoria os eventos de identidade (HU08), na transação do consumo. */
@Injectable()
export class ConsumidorDeAuditoria {
  constructor(@Inject(AuditarEvento) private readonly auditar: AuditarEvento<Transacao>) {}

  @Consome('DispositivoRegistrado', { versao: 1 })
  dispositivoRegistrado(tx: Transacao, evento: EventoDominio): Promise<void> {
    return this.auditar.executar(tx, evento);
  }

  @Consome('SessaoRevogada', { versao: 1 })
  sessaoRevogada(tx: Transacao, evento: EventoDominio): Promise<void> {
    return this.auditar.executar(tx, evento);
  }

  @Consome('ContaBloqueada', { versao: 1 })
  contaBloqueada(tx: Transacao, evento: EventoDominio): Promise<void> {
    return this.auditar.executar(tx, evento);
  }

  @Consome('RedefinicaoDeSenhaSolicitada', { versao: 1 })
  redefinicaoSolicitada(tx: Transacao, evento: EventoDominio): Promise<void> {
    return this.auditar.executar(tx, evento);
  }
}
