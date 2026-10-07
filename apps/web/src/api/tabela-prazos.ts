import { queryOptions, type QueryClient } from '@tanstack/react-query';

import { chaves } from './chaves';
import { exigir, type ClienteApi } from './cliente';

import type { PedidoDeVersaoDaTabela, VersaoDaTabela } from '@pz/contracts';
import type { paths } from '@pz/contracts/gerado/api';

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
  /** Maior versão aprovada; a escolha pela data do ato é do módulo prazos (selecionarVigente). */
  readonly ultimaAprovada: VersaoDaTabela | undefined;
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
          ultimaAprovada: ordenadas.find((v) => v.status === 'aprovado'),
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
  versoes: () =>
    queryOptions({
      queryKey: chaves.tabelaPrazos.versoes(),
      queryFn: ({ signal }) => exigir(api.GET('/v1/admin/tabela-prazos', { signal })),
    }),
});

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
  };
};
