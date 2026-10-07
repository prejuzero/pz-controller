import { Inject, Injectable } from '@nestjs/common';
import { AuditarEvento } from '@pz/auditoria';
import { registrarCorrecaoDeIa } from '@pz/observability';

import { Consome } from '../eventos/consome.js';

import type { Transacao } from '@pz/db';
import type { EventoDominio } from '@pz/kernel';

/**
 * Leva à trilha de auditoria os eventos de identidade (HU08) e as rejeições de notificação
 * (HU30), na transação do consumo.
 */
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

  @Consome('NotificacaoRejeitada', { versao: 1 })
  notificacaoRejeitada(tx: Transacao, evento: EventoDominio): Promise<void> {
    return this.auditar.executar(tx, evento);
  }

  @Consome('SugestaoIaCorrigida', { versao: 1 })
  sugestaoIaCorrigida(tx: Transacao, evento: EventoDominio): Promise<void> {
    // Métrica de qualidade (taxa de correção por tarefa): a tarefa é o prefixo da versão do prompt.
    const { origemIa } = evento.payload as { origemIa?: { versaoPrompt?: string } };
    registrarCorrecaoDeIa(origemIa?.versaoPrompt?.split('@')[0] ?? 'desconhecida');
    return this.auditar.executar(tx, evento);
  }
}
