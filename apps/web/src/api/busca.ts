import { infiniteQueryOptions, keepPreviousData, queryOptions } from '@tanstack/react-query';

import { chaves } from './chaves';
import { exigir, type ClienteApi } from './cliente';

import type { components } from '@pz/contracts/gerado/api';

/** Filtros da tela (cursor e tamanho da página são da paginação, não do estado). */
export type FiltrosDaTela = Omit<components['schemas']['FiltrosBusca'], 'cursor' | 'limite'>;
const LIMITE = 20;
export type RecursoDaBusca = 'prazos' | 'publicacoes';

/** Busca avançada e rápida (HU28). O TanStack cancela a requisição obsoleta pelo `signal`. */
export const consultasBusca = (api: ClienteApi) => ({
  prazos: (filtros: FiltrosDaTela) =>
    infiniteQueryOptions({
      queryKey: chaves.busca.resultado('prazos', filtros),
      initialPageParam: undefined as string | undefined,
      queryFn: ({ pageParam, signal }) =>
        exigir(
          api.POST('/v1/busca/prazos', {
            body: {
              ...filtros,
              limite: LIMITE,
              ...(pageParam === undefined ? {} : { cursor: pageParam }),
            },
            signal,
          }),
        ),
      getNextPageParam: (pagina) => pagina.proximoCursor ?? undefined,
      placeholderData: keepPreviousData,
    }),
  publicacoes: (filtros: FiltrosDaTela) =>
    infiniteQueryOptions({
      queryKey: chaves.busca.resultado('publicacoes', filtros),
      initialPageParam: undefined as string | undefined,
      queryFn: ({ pageParam, signal }) =>
        exigir(
          api.POST('/v1/busca/publicacoes', {
            body: {
              ...filtros,
              limite: LIMITE,
              ...(pageParam === undefined ? {} : { cursor: pageParam }),
            },
            signal,
          }),
        ),
      getNextPageParam: (pagina) => pagina.proximoCursor ?? undefined,
      placeholderData: keepPreviousData,
    }),
  rapida: (texto: string) =>
    queryOptions({
      queryKey: chaves.busca.rapida(texto),
      queryFn: ({ signal }) => exigir(api.POST('/v1/busca/rapida', { body: { texto }, signal })),
      enabled: texto.trim().length >= 2,
      staleTime: 30_000,
    }),
});
