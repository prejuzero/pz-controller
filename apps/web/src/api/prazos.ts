import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
  type QueryClient,
} from '@tanstack/react-query';

import { chaves } from './chaves';
import { exigir, type ClienteApi } from './cliente';

export type StatusDoPrazo = 'a-confirmar' | 'pendente' | 'cumprido' | 'vencido' | 'cancelado';
export const STATUS_DO_PRAZO: readonly StatusDoPrazo[] = [
  'a-confirmar',
  'pendente',
  'vencido',
  'cumprido',
  'cancelado',
];

/** Cards do dashboard abertos na lista (HU26): o servidor aplica o critério e o "hoje". */
export type RecorteDaLista = 'vence-hoje' | 'proximos-7-dias' | 'vencidos' | 'sem-ciencia';
export const RECORTES_DA_LISTA: readonly RecorteDaLista[] = [
  'vence-hoje',
  'proximos-7-dias',
  'vencidos',
  'sem-ciencia',
];

/** Lista por situação (aba) ou pelo recorte de um card do dashboard. */
export type FiltroDaLista = { status: StatusDoPrazo } | { recorte: RecorteDaLista };

/** Corpo do ajuste (PedidoDeAjuste): só os campos que mudam. */
export interface Ajuste {
  versao: number;
  motivo: string;
  tipoAto?: string;
  dias?: number;
  vencimento?: string;
}
export interface Cancelamento {
  versao: number;
  motivo: string;
}

/** Corpo do cadastro manual (PedidoDePrazoManual, HU25). */
export interface PrazoManual {
  processoId: string;
  tipoAto: string;
  ramo?: 'civel' | 'juizados' | 'trabalhista' | 'penal' | 'juizado-criminal';
  dias?: number;
  meio: 'djen' | 'portal' | 'manual';
  dataDeReferencia: string;
  origem: 'djen' | 'manual' | 'painel';
  observacao?: string;
  documento?: string;
  vencimentoConfirmado?: string;
}

/** Corpo do agendamento de compromisso (HU25). */
export interface NovoCompromisso {
  titulo: string;
  dataHora: string;
  local?: string;
  processoId?: string;
  lembretesMinutos?: number[];
}

/** Consultas dos prazos do escritório (HU24). As datas vêm prontas da API (motor). */
export const consultasPrazos = (api: ClienteApi) => ({
  lista: (filtro: FiltroDaLista) =>
    infiniteQueryOptions({
      queryKey: chaves.prazos.lista(filtro),
      initialPageParam: undefined as string | undefined,
      queryFn: ({ pageParam, signal }) =>
        exigir(
          api.GET('/v1/prazos', {
            params: {
              query: pageParam === undefined ? filtro : { ...filtro, cursor: pageParam },
            },
            signal,
          }),
        ),
      getNextPageParam: (pagina) => pagina.proximoCursor ?? undefined,
      placeholderData: keepPreviousData,
    }),
  resumo: () =>
    queryOptions({
      queryKey: chaves.dashboard.resumo(),
      queryFn: ({ signal }) => exigir(api.GET('/v1/dashboard/resumo', { signal })),
    }),
  linhaDoTempo: () =>
    queryOptions({
      queryKey: chaves.dashboard.linhaDoTempo(),
      queryFn: ({ signal }) =>
        exigir(
          api.GET('/v1/dashboard/linha-do-tempo', { params: { query: { dias: 30 } }, signal }),
        ),
    }),
  proximos: () =>
    queryOptions({
      queryKey: chaves.dashboard.proximos(),
      queryFn: ({ signal }) =>
        exigir(
          api.GET('/v1/dashboard/proximos-prazos', { params: { query: { limite: 10 } }, signal }),
        ),
    }),
  atos: () =>
    queryOptions({
      queryKey: [...chaves.prazos.todas, 'atos'] as const,
      queryFn: ({ signal }) => exigir(api.GET('/v1/tipos-de-ato', { signal })),
      staleTime: 5 * 60_000,
    }),
  compromissos: (de: string, ate: string) =>
    queryOptions({
      queryKey: [...chaves.prazos.todas, 'compromissos', de, ate] as const,
      queryFn: ({ signal }) =>
        exigir(api.GET('/v1/compromissos', { params: { query: { de, ate } }, signal })),
    }),
  detalhe: (id: string) =>
    queryOptions({
      queryKey: chaves.prazos.detalhe(id),
      queryFn: ({ signal }) =>
        exigir(api.GET('/v1/prazos/{id}', { params: { path: { id } }, signal })),
    }),
});

export const mutacoesPrazos = (api: ClienteApi, cache: QueryClient) => {
  const invalidar = () => cache.invalidateQueries({ queryKey: chaves.prazos.todas });
  const comVersao =
    (acao: '/v1/prazos/{id}/confirmar' | '/v1/prazos/{id}/cumprir') =>
    ({ id, versao }: { id: string; versao: number }) =>
      exigir(api.POST(acao, { params: { path: { id } }, body: { versao } }));
  return {
    confirmar: { mutationFn: comVersao('/v1/prazos/{id}/confirmar'), onSuccess: invalidar },
    cumprir: { mutationFn: comVersao('/v1/prazos/{id}/cumprir'), onSuccess: invalidar },
    cancelar: {
      mutationFn: ({ id, ...body }: Cancelamento & { id: string }) =>
        exigir(api.POST('/v1/prazos/{id}/cancelar', { params: { path: { id } }, body })),
      onSuccess: invalidar,
    },
    ajustar: {
      mutationFn: ({ id, ...body }: Ajuste & { id: string }) =>
        exigir(api.POST('/v1/prazos/{id}/ajustar', { params: { path: { id } }, body })),
      onSuccess: invalidar,
    },
    cadastrar: {
      mutationFn: (body: PrazoManual) => exigir(api.POST('/v1/prazos', { body })),
      onSuccess: invalidar,
    },
    agendar: {
      mutationFn: (body: NovoCompromisso) => exigir(api.POST('/v1/compromissos', { body })),
      onSuccess: invalidar,
    },
    cancelarCompromisso: {
      mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
        exigir(
          api.POST('/v1/compromissos/{id}/cancelar', {
            params: { path: { id } },
            body: { motivo },
          }),
        ),
      // Sem aguardar: a lista recarregada desmonta o item (e o diálogo) antes do aviso de sucesso.
      onSuccess: () => {
        void invalidar();
      },
    },
    /** Cadastro assistido por PDF: o arquivo vai como corpo binário (até 10 MB). */
    analisarPdf: {
      mutationFn: (arquivo: Blob) =>
        exigir(
          api.POST('/v1/assistente/pdf', {
            // O contrato descreve o corpo como binário; o cliente gerado o tipa como string.
            body: arquivo as unknown as string,
            bodySerializer: (corpo: unknown) => corpo as BodyInit,
            headers: { 'Content-Type': 'application/pdf' },
          }),
        ),
    },
    linkDoDocumento: {
      mutationFn: (id: string) =>
        exigir(api.GET('/v1/prazos/{id}/documento', { params: { path: { id } } })),
    },
    /** Cadastro assistido: ato e prazo citado do texto colado (nunca data). */
    analisar: {
      mutationFn: (texto: string) =>
        exigir(api.POST('/v1/assistente/analisar', { body: { texto } })),
    },
    /** Prévia do cadastro manual pelo motor, sem gravar. */
    simularNovo: {
      mutationFn: (body: PrazoManual) => exigir(api.POST('/v1/prazos/simular', { body })),
    },
    /** Prévia do ajuste: o mesmo motor, sem gravar (nada é calculado no navegador). */
    simular: {
      mutationFn: ({ id, ...body }: Ajuste & { id: string }) =>
        exigir(api.POST('/v1/prazos/{id}/simular-ajuste', { params: { path: { id } }, body })),
    },
  };
};
