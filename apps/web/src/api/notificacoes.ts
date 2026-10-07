import { queryOptions } from '@tanstack/react-query';

import { chaves } from './chaves';
import { exigir, type ClienteApi } from './cliente';

/** Consultas das notificações (HU30). Os hooks em hooks.ts só as repassam. */
export const consultasNotificacoes = (api: ClienteApi) => ({
  avisos: () =>
    queryOptions({
      queryKey: chaves.notificacoes.avisos(),
      queryFn: ({ signal }) => exigir(api.GET('/v1/notificacoes/avisos', { signal })),
    }),
});
