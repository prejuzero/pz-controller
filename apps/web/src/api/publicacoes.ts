import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
  type QueryClient,
} from '@tanstack/react-query';

import { chaves } from './chaves';
import { exigir, type ClienteApi } from './cliente';

export interface FiltrosPublicacoes {
  novas?: 'true';
  de?: string;
  ate?: string;
  processoId?: string;
}

/** Consultas das publicações do escritório (HU18). Os hooks em hooks.ts só as repassam. */
export const consultasPublicacoes = (api: ClienteApi) => ({
  lista: (filtros: FiltrosPublicacoes) =>
    infiniteQueryOptions({
      queryKey: chaves.publicacoes.lista(filtros),
      initialPageParam: undefined as string | undefined,
      queryFn: ({ pageParam, signal }) =>
        exigir(
          api.GET('/v1/publicacoes', {
            params: {
              query: pageParam === undefined ? filtros : { ...filtros, cursor: pageParam },
            },
            signal,
          }),
        ),
      getNextPageParam: (pagina) => pagina.proximoCursor ?? undefined,
      placeholderData: keepPreviousData,
    }),
  detalhe: (id: string) =>
    queryOptions({
      queryKey: chaves.publicacoes.detalhe(id),
      queryFn: ({ signal }) =>
        exigir(api.GET('/v1/publicacoes/{id}', { params: { path: { id } }, signal })),
    }),
});

export const mutacoesPublicacoes = (api: ClienteApi, cache: QueryClient) => ({
  /** Leitura é indício de conhecimento, não ciência (a ciência é da HU33). */
  marcarLida: {
    mutationFn: (id: string) =>
      exigir(api.POST('/v1/publicacoes/{id}/lida', { params: { path: { id } } })),
    onSuccess: () => cache.invalidateQueries({ queryKey: chaves.publicacoes.todas }),
  },
});
