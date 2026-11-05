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
  /** Envios por e-mail de quem está na sessão (PZ-361); pendentes são consultados de novo. */
  envios: () =>
    queryOptions({
      queryKey: chaves.notificacoes.envios(),
      queryFn: ({ signal }) => exigir(api.GET('/v1/envios', { signal })),
      refetchInterval: (consulta) =>
        consulta.state.data?.itens.some((e) => e.situacao === 'pendente') === true ? 10_000 : false,
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

export type PedidoDeEnvio = components['schemas']['PedidoDeEnvio'];

/**
 * Envio manual por e-mail (HU32). O erro fica no diálogo: a confirmação de sigilo (422) é um
 * passo do fluxo, não uma falha.
 */
export const mutacaoEnvioPorEmail = (api: ClienteApi, cache?: QueryClient) => ({
  mutationFn: (pedido: PedidoDeEnvio) => exigir(api.POST('/v1/envios', { body: pedido })),
  meta: { erroNoFormulario: true },
  // A lista de envios (PZ-361) mostra o novo como pendente.
  onSuccess: () => cache?.invalidateQueries({ queryKey: chaves.notificacoes.envios() }),
});
