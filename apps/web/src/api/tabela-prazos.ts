import { queryOptions, type QueryClient } from '@tanstack/react-query';

import { chaves } from './chaves';
import { exigir, type ClienteApi } from './cliente';

import type { PedidoDeVersaoDaTabela, VersaoConsultada as VersaoDaTabela } from '@pz/contracts';
import type { components, paths } from '@pz/contracts/gerado/api';

type CorpoDaVersao =
  paths['/v1/admin/tabela-prazos']['post']['requestBody']['content']['application/json'];
type CorpoDoTipo =
  paths['/v1/admin/tabela-prazos/tipos-de-ato']['post']['requestBody']['content']['application/json'];

/** Versões de um ato num ramo, da mais nova para a mais antiga. */
export interface GrupoDaTabela {
  readonly chave: string;
  readonly tipoAto: string;
  readonly ramo: VersaoDaTabela['ramo'];
  readonly versoes: readonly VersaoDaTabela[];
  /** A que vale hoje, marcada pela API na data do servidor (selecionarVigente, PZ-298). */
  readonly vigente: VersaoDaTabela | undefined;
  readonly rascunhos: number;
}

export function agruparVersoes(versoes: readonly VersaoDaTabela[]): GrupoDaTabela[] {
  const grupos = new Map<string, VersaoDaTabela[]>();
  for (const versao of versoes) {
    const chave = `${versao.tipoAto}|${versao.ramo}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), versao]);
  }
  return [...grupos.entries()]
    .flatMap(([chave, doGrupo]) => {
      const ordenadas = [...doGrupo].sort((a, b) => b.versao - a.versao);
      const [primeira] = ordenadas;
      if (primeira === undefined) return [];
      return [
        {
          chave,
          tipoAto: primeira.tipoAto,
          ramo: primeira.ramo,
          versoes: ordenadas,
          vigente: ordenadas.find((v) => v.vigente),
          rascunhos: ordenadas.filter((v) => v.status === 'rascunho').length,
        },
      ];
    })
    .sort((a, b) => a.chave.localeCompare(b.chave));
}

export const CAMPOS_COMPARADOS = [
  'dias',
  'unidade',
  'fundamento',
  'fonteUrl',
  'vigenciaInicio',
  'vigenciaFim',
  'contagem',
  'politicaDobro',
  'calculo',
  'marcoInicial',
  'localDoAto',
  'alerta',
] as const;
export type CampoComparado = (typeof CAMPOS_COMPARADOS)[number];

export interface Diferenca {
  readonly campo: CampoComparado;
  readonly antes: string;
  readonly depois: string;
}

/** O que muda de uma versão para a seguinte (diff exibido ao curador antes de aprovar). */
export function diferencas(anterior: VersaoDaTabela, atual: VersaoDaTabela): Diferenca[] {
  const texto = (valor: string | number | null) => (valor === null ? '—' : String(valor));
  return CAMPOS_COMPARADOS.filter((campo) => anterior[campo] !== atual[campo]).map((campo) => ({
    campo,
    antes: texto(anterior[campo]),
    depois: texto(atual[campo]),
  }));
}

/** Campos opcionais ausentes saem do corpo (o JSON não leva `undefined`; o tipo gerado é exato). */
const semIndefinidos = (corpo: object): unknown =>
  Object.fromEntries(Object.entries(corpo).filter(([, valor]) => valor !== undefined));

/** Consultas e mutações da tabela de prazos (HU15). Os hooks em hooks.ts só as repassam. */
export const consultasTabelaPrazos = (api: ClienteApi) => ({
  tiposDeAto: () =>
    queryOptions({
      queryKey: chaves.tabelaPrazos.tipos(),
      queryFn: ({ signal }) => exigir(api.GET('/v1/admin/tabela-prazos/tipos-de-ato', { signal })),
    }),
  /** Regras rápidas da classificação (PZ-313). */
  regras: () =>
    queryOptions({
      queryKey: chaves.regrasDeClassificacao,
      queryFn: ({ signal }) => exigir(api.GET('/v1/admin/classificacoes/regras', { signal })),
    }),
  versoes: () =>
    queryOptions({
      queryKey: chaves.tabelaPrazos.versoes(),
      queryFn: ({ signal }) => exigir(api.GET('/v1/admin/tabela-prazos', { signal })),
    }),
});

export type PedidoDeRegra = components['schemas']['PedidoDeRegraDeClassificacao'];

/** Curadoria das regras rápidas (PZ-313): propor, ativar (outra curadora) e retirar. */
export const mutacoesRegras = (api: ClienteApi, cache: QueryClient) => {
  const invalidar = () => cache.invalidateQueries({ queryKey: chaves.regrasDeClassificacao });
  return {
    propor: {
      mutationFn: (pedido: PedidoDeRegra) =>
        exigir(api.POST('/v1/admin/classificacoes/regras', { body: pedido })),
      onSuccess: invalidar,
    },
    ativar: {
      mutationFn: ({ codigo, versao }: { codigo: string; versao: number }) =>
        exigir(
          api.POST('/v1/admin/classificacoes/regras/{codigo}/{versao}/ativar', {
            params: { path: { codigo, versao } },
          }),
        ),
      onSuccess: invalidar,
    },
    retirar: {
      mutationFn: (codigo: string) =>
        exigir(
          api.POST('/v1/admin/classificacoes/regras/{codigo}/retirar', {
            params: { path: { codigo } },
          }),
        ),
      onSuccess: invalidar,
    },
  };
};

export const mutacoesTabelaPrazos = (api: ClienteApi, cache: QueryClient) => {
  const invalidar = () => cache.invalidateQueries({ queryKey: chaves.tabelaPrazos.todas });
  return {
    cadastrarTipo: {
      mutationFn: (pedido: { codigo: string; nome: string; descricao: string }) =>
        exigir(
          api.POST('/v1/admin/tabela-prazos/tipos-de-ato', {
            body: semIndefinidos(pedido) as CorpoDoTipo,
          }),
        ),
      onSuccess: invalidar,
    },
    propor: {
      mutationFn: (pedido: PedidoDeVersaoDaTabela) =>
        exigir(
          api.POST('/v1/admin/tabela-prazos', { body: semIndefinidos(pedido) as CorpoDaVersao }),
        ),
      onSuccess: invalidar,
    },
    aprovar: {
      mutationFn: (id: string) =>
        exigir(api.POST('/v1/admin/tabela-prazos/{id}/aprovar', { params: { path: { id } } })),
      onSuccess: invalidar,
    },
    /** Carga da planilha: todos os rascunhos de uma vez, cada um auditado. */
    aprovarEmLote: {
      mutationFn: (ids: string[]) =>
        exigir(api.POST('/v1/admin/tabela-prazos/aprovacao-em-lote', { body: { ids } })),
      onSuccess: invalidar,
    },
    importar: {
      mutationFn: (body: { csv: string; somentePrevia: boolean }) =>
        exigir(api.POST('/v1/admin/tabela-prazos/importacao', { body })),
      onSuccess: invalidar,
    },
  };
};
