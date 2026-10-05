import type {
  EntradaDoHistorico,
  HistoricoDeSituacao,
} from '../application/registrar-verificacao.js';
import type { TransacaoEmMemoria } from '@pz/kernel';

/** Histórico em memória, até a persistência no Postgres (HU05). */
export class HistoricoEmMemoria implements HistoricoDeSituacao<TransacaoEmMemoria> {
  readonly #entradas: EntradaDoHistorico[] = [];

  registrar(transacao: TransacaoEmMemoria, entrada: EntradaDoHistorico): Promise<void> {
    transacao.aoConfirmar(() => this.#entradas.push(entrada));
    return Promise.resolve();
  }

  entradas(): readonly EntradaDoHistorico[] {
    return [...this.#entradas];
  }
}
