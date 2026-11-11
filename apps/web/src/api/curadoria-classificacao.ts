import { queryOptions, type QueryClient } from '@tanstack/react-query';

import { chaves } from './chaves';
import { exigir, type ClienteApi } from './cliente';

import type { components } from '@pz/contracts/gerado/api';

export type PedidoDeDecisao = components['schemas']['PedidoDeDecisaoDoCaso'];

/** Curadoria da classificação (PZ-336): fila de revisão manual (HU21) e casos candidatos (HU22). */
export const consultasCuradoriaClassificacao = (api: ClienteApi) => ({
  revisaoManual: () =>
    queryOptions({
      queryKey: [...chaves.curadoriaClassificacao.todas, 'revisao-manual'] as const,
      queryFn: ({ signal }) =>
        exigir(
          api.GET('/v1/admin/classificacoes/revisao-manual', {
            params: { query: { limite: 100 } },
            signal,
          }),
        ),
    }),
  candidatosPendentes: () =>
    queryOptions({
      queryKey: [...chaves.curadoriaClassificacao.todas, 'candidatos'] as const,
      queryFn: ({ signal }) =>
        exigir(
          api.GET('/v1/admin/classificacoes/candidatos', {
            params: { query: { status: 'pendente', limite: 100 } },
            signal,
          }),
        ),
    }),
});

export const mutacoesCuradoriaClassificacao = (api: ClienteApi, cache: QueryClient) => ({
  decidir: {
    mutationFn: ({ id, pedido }: { id: string; pedido: PedidoDeDecisao }) =>
      exigir(
        api.POST('/v1/admin/classificacoes/candidatos/{id}/decisao', {
          params: { path: { id } },
          body: pedido,
        }),
      ),
    onSuccess: () => cache.invalidateQueries({ queryKey: chaves.curadoriaClassificacao.todas }),
  },
  /** Casos aceitos no formato de eval/casos, para baixar e versionar no repositório. */
  exportar: {
    mutationFn: () => exigir(api.GET('/v1/admin/classificacoes/candidatos/exportacao')),
  },
});
