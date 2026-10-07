import { OutboxEmMemoria } from '@pz/kernel';
import { TermosEmMemoria } from '@pz/termos';

import type { TransacaoEmMemoria, Uuid } from '@pz/kernel';

/** Termos em memória para os testes da API (sem banco); devolve o repositório para semear. */
export function termosEmMemoria(repositorio = new TermosEmMemoria()) {
  const unidade = new OutboxEmMemoria();
  return {
    repositorio,
    dependencias: {
      noTenant: {
        executar: <T>(_tenant: Uuid, trabalho: (tx: TransacaoEmMemoria) => Promise<T>) =>
          unidade.executar(trabalho),
      },
      documentos: repositorio,
      aceites: repositorio,
      trilha: { registrar: () => Promise.resolve() },
    },
  };
}
