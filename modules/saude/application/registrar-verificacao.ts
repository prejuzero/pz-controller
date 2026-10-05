import { VerificacaoDeSituacao } from '../domain/situacao.js';

import type { ConsultarSituacao } from './consultar-situacao.js';
import type { Situacao, SituacaoVerificada } from '../domain/situacao.js';
import type { Clock, Instant, Outbox, UnidadeDeTrabalho, Uuid } from '@pz/kernel';

/**
 * Registra uma verificação e publica `SituacaoVerificada` pelo outbox, na mesma transação
 * (ADR-004): o caso de uso nunca enfileira direto.
 */
export class RegistrarVerificacao<Transacao> {
  constructor(
    private readonly consultar: ConsultarSituacao,
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly outbox: Outbox<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(tenantId: Uuid): Promise<Situacao> {
    const relatorio = await this.consultar.executar();
    const verificacao = VerificacaoDeSituacao.registrar(
      tenantId,
      relatorio.dependencias,
      this.relogio,
    );
    await this.unidade.executar((transacao) =>
      this.outbox.gravar(transacao, verificacao.retirarEventos()),
    );
    return verificacao.situacao;
  }
}

export interface EntradaDoHistorico {
  readonly eventoId: Uuid;
  readonly tenantId: Uuid;
  readonly situacao: Situacao;
  readonly em: Instant;
}

/** Porta: histórico de verificações, gravado na transação do consumidor. */
export interface HistoricoDeSituacao<Transacao> {
  registrar(transacao: Transacao, entrada: EntradaDoHistorico): Promise<void>;
}

/** Nome do consumidor: chave da deduplicação em `evento_processado`. */
export const CONSUMIDOR_HISTORICO = 'saude.historico';

/**
 * Consumidor de `SituacaoVerificada`: guarda o histórico na transação do consumo. A entrega
 * única é garantida por quem despacha (`@Consome` no worker, via `processarUmaVez`).
 */
export class RegistrarHistoricoDeSituacao<Transacao> {
  constructor(private readonly historico: HistoricoDeSituacao<Transacao>) {}

  tratar(transacao: Transacao, evento: SituacaoVerificada): Promise<void> {
    return this.historico.registrar(transacao, {
      eventoId: evento.id,
      tenantId: evento.tenantId,
      situacao: evento.payload.situacao,
      em: evento.ocorridoEm,
    });
  }
}
