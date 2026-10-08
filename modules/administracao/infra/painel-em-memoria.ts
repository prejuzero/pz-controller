import type { ArmazemDoPainel, ContadorDeFilas, ResumoDeFila } from '../application/painel.js';
import type { FalhaDeIntegracao, Retrato } from '../domain/integracoes.js';

/** Painel em memória, para testes (sem Redis). */
export class PainelEmMemoria implements ArmazemDoPainel, ContadorDeFilas {
  readonly #retratos = new Map<string, Retrato>();
  readonly #falhas: FalhaDeIntegracao[] = [];
  filas: ResumoDeFila[] = [];

  retratos(): Promise<Retrato[]> {
    return Promise.resolve([...this.#retratos.values()]);
  }

  gravar(retrato: Retrato, falhas: readonly FalhaDeIntegracao[]): Promise<void> {
    this.#retratos.set(retrato.instancia, retrato);
    this.#falhas.unshift(...falhas);
    return Promise.resolve();
  }

  falhas(limite: number): Promise<FalhaDeIntegracao[]> {
    return Promise.resolve(this.#falhas.slice(0, limite));
  }

  resumo(): Promise<ResumoDeFila[]> {
    return Promise.resolve(this.filas);
  }
}
