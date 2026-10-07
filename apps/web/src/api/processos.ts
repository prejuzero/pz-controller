import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
  type QueryClient,
} from '@tanstack/react-query';

import { chaves } from './chaves';
import { exigir, type ClienteApi } from './cliente';

import type {
  AlteracaoDoCliente,
  AlteracaoDoProcesso,
  PedidoDeCliente,
  PedidoDeCobertura,
  PedidoDeProcesso,
} from '@pz/contracts';

export type Cobertura = PedidoDeCobertura['cobertura'];

export interface FiltrosProcessos {
  numero?: string;
  cobertura?: Cobertura;
}

/** Campos opcionais ausentes saem do corpo (o JSON não leva `undefined`; o tipo gerado é exato). */
function semIndefinidos<T extends object>(objeto: T): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(objeto).filter(([, valor]) => valor !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}

// Os clientes cabem numa página na seleção do formulário e na tabela (escritórios pequenos).
const LIMITE_CLIENTES = 100;

/** Consultas de processos e clientes (HU12). Os hooks em hooks.ts só as repassam. */
export const consultasProcessos = (api: ClienteApi) => ({
  lista: (filtros: FiltrosProcessos) =>
    infiniteQueryOptions({
      queryKey: chaves.processos.lista(filtros),
      initialPageParam: undefined as string | undefined,
      queryFn: ({ pageParam, signal }) =>
        exigir(
          api.GET('/v1/processos', {
            params: { query: semIndefinidos({ ...filtros, cursor: pageParam }) },
            signal,
          }),
        ),
      getNextPageParam: (pagina) => pagina.proximoCursor ?? undefined,
      placeholderData: keepPreviousData,
    }),
  detalhe: (id: string) =>
    queryOptions({
      queryKey: chaves.processos.detalhe(id),
      queryFn: ({ signal }) =>
        exigir(api.GET('/v1/processos/{id}', { params: { path: { id } }, signal })),
    }),
  clientes: () =>
    queryOptions({
      queryKey: chaves.clientes.lista(),
      queryFn: ({ signal }) =>
        exigir(api.GET('/v1/clientes', { params: { query: { limite: LIMITE_CLIENTES } }, signal })),
    }),
});

export const mutacoesProcessos = (api: ClienteApi, cache: QueryClient) => {
  const invalidarProcessos = () => cache.invalidateQueries({ queryKey: chaves.processos.todas });
  const invalidarClientes = () => cache.invalidateQueries({ queryKey: chaves.clientes.todas });
  const caminho = (id: string) => ({ params: { path: { id } } });
  return {
    cadastrar: {
      mutationFn: (pedido: PedidoDeProcesso) =>
        exigir(api.POST('/v1/processos', { body: semIndefinidos(pedido) })),
      onSuccess: invalidarProcessos,
    },
    atualizar: {
      mutationFn: ({ id, ...alteracao }: AlteracaoDoProcesso & { id: string }) =>
        exigir(
          api.PATCH('/v1/processos/{id}', { ...caminho(id), body: semIndefinidos(alteracao) }),
        ),
      onSuccess: invalidarProcessos,
    },
    alterarCobertura: {
      mutationFn: ({ id, ...pedido }: PedidoDeCobertura & { id: string }) =>
        exigir(
          api.PUT('/v1/processos/{id}/cobertura', { ...caminho(id), body: semIndefinidos(pedido) }),
        ),
      onSuccess: invalidarProcessos,
    },
    cadastrarCliente: {
      mutationFn: (pedido: PedidoDeCliente) =>
        exigir(api.POST('/v1/clientes', { body: semIndefinidos(pedido) })),
      onSuccess: invalidarClientes,
    },
    atualizarCliente: {
      mutationFn: ({ id, ...alteracao }: AlteracaoDoCliente & { id: string }) =>
        exigir(api.PATCH('/v1/clientes/{id}', { ...caminho(id), body: semIndefinidos(alteracao) })),
      onSuccess: invalidarClientes,
    },
    removerCliente: {
      mutationFn: (id: string) => exigir(api.DELETE('/v1/clientes/{id}', caminho(id))),
      onSuccess: invalidarClientes,
    },
  };
};
