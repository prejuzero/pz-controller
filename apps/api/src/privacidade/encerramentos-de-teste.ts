import type { Instant, Uuid } from '@pz/kernel';
import type { Encerramento, RepositorioDeEncerramentos } from '@pz/privacidade';

/** Encerramentos em memória para os testes da API (sem banco). */
export class EncerramentosEmTeste implements RepositorioDeEncerramentos<unknown> {
  readonly #itens = new Map<string, Encerramento>();

  buscar(_tx: unknown, tenantId: Uuid): Promise<Encerramento | undefined> {
    return Promise.resolve(this.#itens.get(tenantId));
  }

  salvarPedido(_tx: unknown, tenantId: Uuid, e: Encerramento): Promise<void> {
    this.#itens.set(tenantId, e);
    return Promise.resolve();
  }

  cancelar(_tx: unknown, tenantId: Uuid, em: Instant): Promise<void> {
    const atual = this.#itens.get(tenantId);
    if (atual !== undefined) this.#itens.set(tenantId, { ...atual, canceladoEm: em });
    return Promise.resolve();
  }
}
