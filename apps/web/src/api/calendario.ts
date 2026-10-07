import { keepPreviousData, queryOptions, type QueryClient } from '@tanstack/react-query';

import { chaves } from './chaves';
import { exigir, type ClienteApi } from './cliente';

import type { PedidoDeEventoDoCalendario } from '@pz/contracts';
import type { paths } from '@pz/contracts/gerado/api';

type CorpoDoEvento =
  paths['/v1/admin/calendario']['post']['requestBody']['content']['application/json'];

/** Campos opcionais ausentes saem do corpo (o JSON não leva `undefined`; o tipo gerado é exato). */
export function corpoDoEvento(pedido: PedidoDeEventoDoCalendario): CorpoDoEvento {
  return Object.fromEntries(
    Object.entries(pedido).filter(([, valor]) => valor !== undefined),
  ) as CorpoDoEvento;
}

/** Período de um ano civil, como a API filtra (eventos que cruzam o período). */
export function periodoDoAno(ano: number): { inicio: string; fim: string } {
  return { inicio: `${String(ano)}-01-01`, fim: `${String(ano)}-12-31` };
}

/** Consultas e mutações do calendário forense (HU13). Os hooks em hooks.ts só as repassam. */
export const consultasCalendario = (api: ClienteApi) => ({
  global: (ano: number) =>
    queryOptions({
      queryKey: chaves.calendario.global(ano),
      queryFn: ({ signal }) =>
        exigir(api.GET('/v1/admin/calendario', { params: { query: periodoDoAno(ano) }, signal })),
      placeholderData: keepPreviousData,
    }),
  locais: (ano: number) =>
    queryOptions({
      queryKey: chaves.calendario.locais(ano),
      queryFn: ({ signal }) =>
        exigir(api.GET('/v1/calendario/locais', { params: { query: periodoDoAno(ano) }, signal })),
      placeholderData: keepPreviousData,
    }),
});

export const mutacoesCalendario = (api: ClienteApi, cache: QueryClient) => {
  const invalidar = () => cache.invalidateQueries({ queryKey: chaves.calendario.todas });
  const caminho = (id: string) => ({ params: { path: { id } } });
  return {
    propor: {
      mutationFn: (pedido: PedidoDeEventoDoCalendario) =>
        exigir(api.POST('/v1/admin/calendario', { body: corpoDoEvento(pedido) })),
      onSuccess: invalidar,
    },
    aprovar: {
      mutationFn: (id: string) =>
        exigir(api.POST('/v1/admin/calendario/{id}/aprovar', caminho(id))),
      onSuccess: invalidar,
    },
    revogar: {
      mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
        exigir(api.POST('/v1/admin/calendario/{id}/revogar', { ...caminho(id), body: { motivo } })),
      onSuccess: invalidar,
    },
    importar: {
      mutationFn: (body: { csv: string; somentePrevia: boolean }) =>
        exigir(api.POST('/v1/admin/calendario/importacao', { body })),
      onSuccess: invalidar,
    },
    cadastrarLocal: {
      mutationFn: (pedido: PedidoDeEventoDoCalendario) =>
        exigir(api.POST('/v1/calendario/locais', { body: corpoDoEvento(pedido) })),
      onSuccess: invalidar,
    },
    revogarLocal: {
      mutationFn: (id: string) =>
        exigir(api.POST('/v1/calendario/locais/{id}/revogar', caminho(id))),
      onSuccess: invalidar,
    },
  };
};
