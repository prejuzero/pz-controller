import { queryOptions, type QueryClient } from '@tanstack/react-query';

import { chaves } from './chaves';
import { exigir, type ClienteApi } from './cliente';

// A faixa de "captura atrasada" some sozinha quando a fonte volta: consulta a cada minuto.
const INTERVALO_MS = 60_000;

/** Status da captura (HU19). O hook em hooks.ts só repassa. */
export const consultasCaptura = (api: ClienteApi) => ({
  status: () =>
    queryOptions({
      queryKey: chaves.captura.status(),
      queryFn: ({ signal }) => exigir(api.GET('/v1/captura/status', { signal })),
      refetchInterval: INTERVALO_MS,
    }),
});

/** "Buscar agora" de uma OAB (HU17): a busca entra na fila e o status mostra o novo intervalo. */
export const mutacoesCaptura = (api: ClienteApi, cache: QueryClient) => ({
  buscarAgora: {
    mutationFn: (oabId: string) =>
      exigir(api.POST('/v1/captura/oabs/{id}/buscar-agora', { params: { path: { id: oabId } } })),
    onSuccess: () => cache.invalidateQueries({ queryKey: chaves.captura.status() }),
  },
});
