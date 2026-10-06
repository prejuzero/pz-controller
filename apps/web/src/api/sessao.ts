import { queryOptions, type QueryClient } from '@tanstack/react-query';

import { chaves } from './chaves';
import { exigir, type ClienteApi } from './cliente';

/** Consultas e mutações da sessão (HU06). Os hooks em hooks.ts só as repassam ao React. */
export const consultasSessao = (api: ClienteApi) => ({
  atual: () =>
    queryOptions({
      queryKey: chaves.sessao.atual(),
      queryFn: ({ signal }) => exigir(api.GET('/v1/auth/eu', { signal })),
    }),
});

export const mutacoesSessao = (api: ClienteApi, cache: QueryClient) => ({
  sair: {
    mutationFn: () => exigir(api.POST('/v1/auth/sair')),
    // Sem sessão, nada em cache pertence mais a ninguém.
    onSuccess: () => {
      cache.clear();
    },
  },
});
