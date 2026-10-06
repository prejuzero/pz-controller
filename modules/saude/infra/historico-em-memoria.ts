import type {
  EntradaDoHistorico,
  HistoricoDeSituacao,
} from '../application/registrar-verificacao.js';

interface ComConfirmacao {
  aoConfirmar(acao: () => void): void;
}

function temConfirmacao(transacao: unknown): transacao is ComConfirmacao {
  return (
    typeof transacao === 'object' &&
    transacao !== null &&
    typeof (transacao as Partial<ComConfirmacao>).aoConfirmar === 'function'
  );
}

/**
 * Histórico em memória do módulo de exemplo (o histórico real teria tabela própria). Com a
 * transação em memória dos testes, só grava quando ela é confirmada; com outra transação
 * (ex.: PostgreSQL), grava na hora.
 */
export class HistoricoEmMemoria implements HistoricoDeSituacao<unknown> {
  readonly #entradas: EntradaDoHistorico[] = [];

  registrar(transacao: unknown, entrada: EntradaDoHistorico): Promise<void> {
    if (temConfirmacao(transacao)) transacao.aoConfirmar(() => this.#entradas.push(entrada));
    else this.#entradas.push(entrada);
    return Promise.resolve();
  }

  entradas(): readonly EntradaDoHistorico[] {
    return [...this.#entradas];
  }
}
