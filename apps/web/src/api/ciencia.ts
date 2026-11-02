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
  confirmar: {
    mutationFn: (id: string) =>
      exigir(api.POST('/v1/prazos/{id}/ciencia', { params: { path: { id } } })),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: chaves.prazos.todas });
    },
  },
});
