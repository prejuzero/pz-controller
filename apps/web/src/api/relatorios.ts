import { queryOptions, type QueryClient } from '@tanstack/react-query';

import { chaves } from './chaves';
import { exigir, type ClienteApi } from './cliente';

import type { components } from '@pz/contracts/gerado/api';

export type PedidoDeRelatorio = components['schemas']['PedidoDeRelatorio'];

/** Relatórios (HU29). Os hooks em hooks.ts só repassam. */
export const consultasRelatorios = (api: ClienteApi) => ({
  lista: () =>
    queryOptions({
      queryKey: chaves.relatorios.lista(),
      queryFn: ({ signal }) => exigir(api.GET('/v1/relatorios', { signal })),
      // Enquanto o worker gera algum, consulta de novo a cada 4 s.
      refetchInterval: (consulta) =>
        consulta.state.data?.itens.some((r) => r.situacao === 'pendente') === true ? 4_000 : false,
    }),
  /** Feed privado da agenda (HU50): só a situação; o endereço aparece uma vez, na criação. */
  assinaturaDaAgenda: () =>
    queryOptions({
      queryKey: chaves.assinaturaDaAgenda,
      queryFn: ({ signal }) => exigir(api.GET('/v1/agenda/assinatura', { signal })),
    }),
});

/** Download do .ics pela sessão do navegador (mesma origem, GET sem CSRF). */
export const ROTA_DO_ICS = '/v1/agenda/prazos.ics';

export const mutacoesRelatorios = (api: ClienteApi, cache: QueryClient) => ({
  solicitar: {
    mutationFn: (pedido: PedidoDeRelatorio) => exigir(api.POST('/v1/relatorios', { body: pedido })),
    onSuccess: () => cache.invalidateQueries({ queryKey: chaves.relatorios.todas }),
  },
  assinarAgenda: {
    mutationFn: () => exigir(api.POST('/v1/agenda/assinatura')),
    onSuccess: () => cache.invalidateQueries({ queryKey: chaves.assinaturaDaAgenda }),
  },
  revogarAgenda: {
    mutationFn: () => exigir(api.DELETE('/v1/agenda/assinatura')),
    onSuccess: () => cache.invalidateQueries({ queryKey: chaves.assinaturaDaAgenda }),
  },
});
