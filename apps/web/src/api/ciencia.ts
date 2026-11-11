import { type QueryClient } from '@tanstack/react-query';

import { chaves } from './chaves';
import { exigir, type ClienteApi } from './cliente';

/** Ciência (HU33): consulta e confirmação pelo link (públicas) e pela sessão. */
export const mutacoesCiencia = (api: ClienteApi, cache: QueryClient) => ({
  consultar: {
    mutationFn: (token: string) => exigir(api.POST('/v1/ciencia/consulta', { body: { token } })),
  },
  confirmarPeloLink: {
    mutationFn: (token: string) => exigir(api.POST('/v1/ciencia/confirmacao', { body: { token } })),
  },
  /** Lote (HU34): cada prazo em transação própria; o resultado diz qual falhou. */
  confirmarEmLote: {
    mutationFn: (prazoIds: string[]) =>
      exigir(api.POST('/v1/ciencia/lote', { body: { prazoIds } })),
    // A seleção vem da lista de prazos ou da busca: as duas mostram a coluna de ciência.
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: chaves.prazos.todas }),
        cache.invalidateQueries({ queryKey: chaves.busca.todas }),
      ]);
    },
  },
  confirmar: {
    mutationFn: (id: string) =>
      exigir(api.POST('/v1/prazos/{id}/ciencia', { params: { path: { id } } })),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: chaves.prazos.todas });
    },
  },
  /** Indício "visualizado" (HU33): avisar que o prazo foi aberto; nunca vira ciência. */
  visualizar: {
    mutationFn: (id: string) =>
      exigir(api.POST('/v1/prazos/{id}/visualizacao', { params: { path: { id } } })),
  },
});
