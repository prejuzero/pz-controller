import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
  type QueryClient,
} from '@tanstack/react-query';

import { chaves } from './chaves';
import { exigir, type ClienteApi } from './cliente';

export type StatusDoPrazo = 'a-confirmar' | 'pendente' | 'cumprido' | 'vencido' | 'cancelado';

/** Corpo do ajuste (PedidoDeAjuste): só os campos que mudam. */
export interface Ajuste {
  versao: number;
  motivo: string;
  tipoAto?: string;
  dias?: number;
  vencimento?: string;
}
export interface Cancelamento {
  versao: number;
  motivo: string;
}

/** Consultas dos prazos do escritório (HU24). As datas vêm prontas da API (motor). */
export const consultasPrazos = (api: ClienteApi) => ({
  lista: (status: StatusDoPrazo) =>
    infiniteQueryOptions({
      queryKey: chaves.prazos.lista({ status }),
      initialPageParam: undefined as string | undefined,
      queryFn: ({ pageParam, signal }) =>
        exigir(
          api.GET('/v1/prazos', {
            params: { query: pageParam === undefined ? { status } : { status, cursor: pageParam } },
            signal,
          }),
        ),
      getNextPageParam: (pagina) => pagina.proximoCursor ?? undefined,
      placeholderData: keepPreviousData,
    }),
  detalhe: (id: string) =>
    queryOptions({
      queryKey: chaves.prazos.detalhe(id),
      queryFn: ({ signal }) =>
        exigir(api.GET('/v1/prazos/{id}', { params: { path: { id } }, signal })),
    }),
});

export const mutacoesPrazos = (api: ClienteApi, cache: QueryClient) => {
  const invalidar = () => cache.invalidateQueries({ queryKey: chaves.prazos.todas });
  const comVersao =
    (acao: '/v1/prazos/{id}/confirmar' | '/v1/prazos/{id}/cumprir') =>
    ({ id, versao }: { id: string; versao: number }) =>
      exigir(api.POST(acao, { params: { path: { id } }, body: { versao } }));
  return {
    confirmar: { mutationFn: comVersao('/v1/prazos/{id}/confirmar'), onSuccess: invalidar },
    cumprir: { mutationFn: comVersao('/v1/prazos/{id}/cumprir'), onSuccess: invalidar },
    cancelar: {
      mutationFn: ({ id, ...body }: Cancelamento & { id: string }) =>
        exigir(api.POST('/v1/prazos/{id}/cancelar', { params: { path: { id } }, body })),
      onSuccess: invalidar,
    },
    ajustar: {
      mutationFn: ({ id, ...body }: Ajuste & { id: string }) =>
        exigir(api.POST('/v1/prazos/{id}/ajustar', { params: { path: { id } }, body })),
      onSuccess: invalidar,
    },
    /** Prévia do ajuste: o mesmo motor, sem gravar (nada é calculado no navegador). */
    simular: {
      mutationFn: ({ id, ...body }: Ajuste & { id: string }) =>
        exigir(api.POST('/v1/prazos/{id}/simular-ajuste', { params: { path: { id } }, body })),
    },
  };
};
