import { queryOptions } from '@tanstack/react-query';

import { chaves } from './chaves';
import { exigir, type ClienteApi } from './cliente';

import type { components } from '@pz/contracts/gerado/api';

type VerificacaoDoHistorico = components['schemas']['VerificacaoDoHistorico'];

/** Histórico do prazo e verificação pública do PDF (HU35). Os hooks em hooks.ts só repassam. */
export const consultasHistorico = (api: ClienteApi) => ({
  doPrazo: (id: string) =>
    queryOptions({
      queryKey: [...chaves.prazos.todas, 'historico', id] as const,
      queryFn: ({ signal }) =>
        exigir(api.GET('/v1/prazos/{id}/historico', { params: { path: { id } }, signal })),
    }),
  verificacao: (codigo: string) =>
    queryOptions({
      queryKey: ['verificacao', codigo] as const,
      // Tipo explícito: a união da resposta não tem nome portável no tipo inferido.
      queryFn: ({ signal }): Promise<VerificacaoDoHistorico> =>
        exigir(api.GET('/v1/verificacoes/{codigo}', { params: { path: { codigo } }, signal })),
    }),
});
