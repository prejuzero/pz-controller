import { queryOptions, type QueryClient } from '@tanstack/react-query';

import { chaves } from './chaves';
import { exigir, type ClienteApi } from './cliente';

/** Pedido de autorização como a tela o lê da URL: só os parâmetros presentes. */
export interface PedidoDeAutorizacaoOAuth {
  response_type: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  scope?: string;
  state?: string;
}

/** Integrações do escritório (HU49): clientes da API e webhooks de saída. */
export const consultasIntegracoes = (api: ClienteApi) => ({
  escopos: () =>
    queryOptions({
      queryKey: chaves.integracoes.escopos(),
      queryFn: ({ signal }) => exigir(api.GET('/v1/integracoes/escopos', { signal })),
      staleTime: Infinity,
    }),
  clientes: () =>
    queryOptions({
      queryKey: chaves.integracoes.clientes(),
      queryFn: ({ signal }) => exigir(api.GET('/v1/integracoes/clientes', { signal })),
    }),
  eventos: () =>
    queryOptions({
      queryKey: chaves.integracoes.eventos(),
      queryFn: ({ signal }) => exigir(api.GET('/v1/integracoes/webhooks/eventos', { signal })),
      staleTime: Infinity,
    }),
  webhooks: () =>
    queryOptions({
      queryKey: chaves.integracoes.webhooks(),
      queryFn: ({ signal }) => exigir(api.GET('/v1/integracoes/webhooks', { signal })),
    }),
  /** Tela de consentimento: o que o app pede, conferido pela API (HU49). */
  autorizacao: (pedido: PedidoDeAutorizacaoOAuth) =>
    queryOptions({
      queryKey: chaves.integracoes.autorizacao(pedido),
      queryFn: ({ signal }) =>
        exigir(api.GET('/v1/oauth/autorizacao', { params: { query: pedido }, signal })),
      retry: false,
    }),
  entregas: () =>
    queryOptions({
      queryKey: chaves.integracoes.entregas(),
      queryFn: ({ signal }) =>
        exigir(
          api.GET('/v1/integracoes/webhooks/entregas', {
            params: { query: { limite: 50 } },
            signal,
          }),
        ),
      // Enquanto houver entrega pendente, o worker ainda está tentando: atualiza a cada 5 s.
      refetchInterval: (consulta) =>
        consulta.state.data?.itens.some((e) => e.situacao === 'pendente') === true ? 5_000 : false,
    }),
});

export const mutacoesIntegracoes = (api: ClienteApi, cache: QueryClient) => {
  const invalidar = (chave: readonly string[]) => () =>
    cache.invalidateQueries({ queryKey: chave });
  return {
    registrarCliente: {
      mutationFn: (pedido: { nome: string; escopos: string[] }) =>
        exigir(api.POST('/v1/integracoes/clientes', { body: pedido })),
      onSuccess: invalidar(chaves.integracoes.clientes()),
    },
    registrarApp: {
      mutationFn: (pedido: { nome: string; escopos: string[]; redirectUris: string[] }) =>
        exigir(api.POST('/v1/integracoes/apps', { body: pedido })),
      onSuccess: invalidar(chaves.integracoes.clientes()),
    },
    autorizar: {
      mutationFn: (pedido: PedidoDeAutorizacaoOAuth) =>
        exigir(api.POST('/v1/oauth/autorizacao', { body: pedido })),
    },
    revogarCliente: {
      mutationFn: (id: string) =>
        exigir(api.DELETE('/v1/integracoes/clientes/{id}', { params: { path: { id } } })),
      onSuccess: invalidar(chaves.integracoes.clientes()),
    },
    registrarWebhook: {
      mutationFn: (pedido: { url: string; descricao: string; eventos: string[] }) =>
        exigir(api.POST('/v1/integracoes/webhooks', { body: pedido })),
      onSuccess: invalidar(chaves.integracoes.webhooks()),
    },
    desativarWebhook: {
      mutationFn: (id: string) =>
        exigir(api.DELETE('/v1/integracoes/webhooks/{id}', { params: { path: { id } } })),
      onSuccess: invalidar(chaves.integracoes.webhooks()),
    },
    testarWebhook: {
      mutationFn: (id: string) =>
        exigir(api.POST('/v1/integracoes/webhooks/{id}/testar', { params: { path: { id } } })),
      onSuccess: invalidar(chaves.integracoes.entregas()),
    },
    reenviarEntrega: {
      mutationFn: (id: string) =>
        exigir(
          api.POST('/v1/integracoes/webhooks/entregas/{id}/reenviar', {
            params: { path: { id } },
          }),
        ),
      onSuccess: invalidar(chaves.integracoes.entregas()),
    },
  };
};
