import { queryOptions, type QueryClient } from '@tanstack/react-query';

import { chaves } from './chaves';
import { exigir, type ClienteApi } from './cliente';

import type { PedidoDeConvite } from '@pz/contracts';

type PerfilDaEquipe = PedidoDeConvite['perfil'];

/** Equipe do escritório (HU41). Os hooks em hooks.ts só repassam. */
export const consultasEquipe = (api: ClienteApi) => ({
  equipe: () =>
    queryOptions({
      queryKey: chaves.membros.lista(),
      queryFn: ({ signal }) => exigir(api.GET('/v1/equipe', { signal })),
    }),
});

export const mutacoesEquipe = (api: ClienteApi, cache: QueryClient) => {
  const invalidar = () => cache.invalidateQueries({ queryKey: chaves.membros.todas });
  return {
    convidar: {
      mutationFn: (pedido: PedidoDeConvite) =>
        exigir(api.POST('/v1/equipe/convites', { body: pedido })),
      onSuccess: invalidar,
    },
    cancelarConvite: {
      mutationFn: (id: string) =>
        exigir(api.DELETE('/v1/equipe/convites/{id}', { params: { path: { id } } })),
      onSuccess: invalidar,
    },
    alterarPerfis: {
      mutationFn: ({ id, perfis }: { id: string; perfis: PerfilDaEquipe[] }) =>
        exigir(
          api.PUT('/v1/equipe/membros/{id}/perfis', { params: { path: { id } }, body: { perfis } }),
        ),
      onSuccess: invalidar,
    },
    desativar: {
      mutationFn: (id: string) =>
        exigir(api.POST('/v1/equipe/membros/{id}/desativar', { params: { path: { id } } })),
      onSuccess: invalidar,
    },
    /** Página do link do convite (sem sessão). */
    descreverConvite: {
      mutationFn: (token: string) =>
        exigir(api.POST('/v1/equipe/convites/descrever', { body: { token } })),
    },
    aceitarConvite: {
      mutationFn: (pedido: { token: string; senha: string }) =>
        exigir(api.POST('/v1/equipe/convites/aceitar', { body: pedido })),
    },
  };
};
