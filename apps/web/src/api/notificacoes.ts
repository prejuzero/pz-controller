import { queryOptions, type QueryClient } from '@tanstack/react-query';

import { chaves } from './chaves';
import { exigir, type ClienteApi } from './cliente';

import type { components } from '@pz/contracts/gerado/api';

/** Consultas das notificações (HU30). Os hooks em hooks.ts só as repassam. */
export const consultasNotificacoes = (api: ClienteApi) => ({
  avisos: () =>
    queryOptions({
      queryKey: chaves.notificacoes.avisos(),
      queryFn: ({ signal }) => exigir(api.GET('/v1/notificacoes/avisos', { signal })),
    }),
  preferencias: () =>
    queryOptions({
      queryKey: chaves.notificacoes.preferencias(),
      queryFn: ({ signal }) => exigir(api.GET('/v1/notificacoes/preferencias', { signal })),
    }),
});

export type PreferenciasDeNotificacao = components['schemas']['PreferenciasDeNotificacao'];

/** Gravar as preferências (HU31): o worker reprograma os lembretes futuros. */
export const mutacoesNotificacoes = (api: ClienteApi, cache: QueryClient) => ({
  salvarPreferencias: {
    mutationFn: (corpo: PreferenciasDeNotificacao) =>
      exigir(api.PUT('/v1/notificacoes/preferencias', { body: corpo })),
    onSuccess: (salvas: PreferenciasDeNotificacao) => {
      cache.setQueryData(chaves.notificacoes.preferencias(), salvas);
    },
  },
});
