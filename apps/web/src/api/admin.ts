import { infiniteQueryOptions, queryOptions, type QueryClient } from '@tanstack/react-query';

import { chaves } from './chaves';
import { exigir, type ClienteApi } from './cliente';

import type { TenantAdministrado } from '@pz/contracts';

/** O formulário sempre envia os dois campos (plano vazio vira null). */
export interface AlteracaoDeAssinatura {
  readonly tenantId: string;
  readonly plano: string | null;
  readonly situacaoAssinatura: TenantAdministrado['situacaoAssinatura'];
}

// O painel de integrações e filas se atualiza sozinho enquanto está aberto.
const INTERVALO_MS = 30_000;

/** Consultas e mutações da área do administrador (HU39). Os hooks em hooks.ts só repassam. */
export const consultasAdmin = (api: ClienteApi) => ({
  tenants: () =>
    infiniteQueryOptions({
      queryKey: chaves.admin.tenants(),
      initialPageParam: undefined as string | undefined,
      queryFn: ({ pageParam, signal }) =>
        exigir(
          api.GET('/v1/admin/tenants', {
            params: { query: pageParam === undefined ? {} : { cursor: pageParam } },
            signal,
          }),
        ),
      getNextPageParam: (pagina) => pagina.proximoCursor ?? undefined,
    }),
  integracoes: () =>
    queryOptions({
      queryKey: chaves.admin.integracoes(),
      queryFn: ({ signal }) => exigir(api.GET('/v1/admin/integracoes', { signal })),
      refetchInterval: INTERVALO_MS,
    }),
  filas: () =>
    queryOptions({
      queryKey: chaves.admin.filas(),
      queryFn: ({ signal }) => exigir(api.GET('/v1/admin/filas', { signal })),
      refetchInterval: INTERVALO_MS,
    }),
  rejeicoes: () =>
    infiniteQueryOptions({
      queryKey: chaves.admin.rejeicoes(),
      initialPageParam: undefined as string | undefined,
      queryFn: ({ pageParam, signal }) =>
        exigir(
          api.GET('/v1/admin/rejeicoes-email', {
            params: { query: pageParam === undefined ? {} : { cursor: pageParam } },
            signal,
          }),
        ),
      getNextPageParam: (pagina) => pagina.proximoCursor ?? undefined,
    }),
});

export const mutacoesAdmin = (api: ClienteApi, cache: QueryClient) => {
  const invalidarTenants = () => cache.invalidateQueries({ queryKey: chaves.admin.tenants() });
  const caminho = (tenantId: string) => ({ params: { path: { tenantId } } });
  return {
    alterarAssinatura: {
      mutationFn: ({ tenantId, ...corpo }: AlteracaoDeAssinatura) =>
        exigir(
          api.PATCH('/v1/admin/tenants/{tenantId}/assinatura', {
            ...caminho(tenantId),
            body: corpo,
          }),
        ),
      onSuccess: invalidarTenants,
    },
    suspender: {
      mutationFn: ({ tenantId, motivo }: { tenantId: string; motivo: string }) =>
        exigir(
          api.POST('/v1/admin/tenants/{tenantId}/suspensao', {
            ...caminho(tenantId),
            body: { motivo },
          }),
        ),
      onSuccess: invalidarTenants,
    },
    reativar: {
      mutationFn: (tenantId: string) =>
        exigir(api.DELETE('/v1/admin/tenants/{tenantId}/suspensao', caminho(tenantId))),
      onSuccess: invalidarTenants,
    },
    // A sessão muda (tenant efetivo e permissões): tudo em cache é de outro tenant.
    impersonar: {
      mutationFn: (pedido: { tenantId: string; motivo: string }) =>
        exigir(api.POST('/v1/admin/impersonacao', { body: pedido })),
      onSuccess: () => cache.invalidateQueries(),
    },
  };
};
