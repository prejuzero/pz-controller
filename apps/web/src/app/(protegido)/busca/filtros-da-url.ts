import type { FiltrosDaTela, RecursoDaBusca } from '../../../api/busca';

/** Campos de texto livre (vão para a URL como estão). */
export const CAMPOS_DE_TEXTO = [
  'numeroCnj',
  'partes',
  'palavraChave',
  'tribunal',
  'orgao',
  'comarca',
  'oab',
] as const;
/** Campos de seleção múltipla (vírgula na URL). */
export const CAMPOS_DE_LISTA = ['tiposAto', 'statusPrazo', 'statusCiencia', 'origem'] as const;
/** Só existem no prazo: a busca de publicações não os envia. */
export const SO_DE_PRAZO = [
  'tiposAto',
  'statusPrazo',
  'statusCiencia',
  'responsavelId',
  'ramo',
  'origem',
] as const;

export interface EstadoDaBusca {
  readonly recurso: RecursoDaBusca;
  readonly filtros: FiltrosDaTela;
}

/** Estado da busca a partir da URL (RF50: o estado vive na URL, compartilhável). */
export function lerDaUrl(busca: URLSearchParams): EstadoDaBusca {
  const filtros: Record<string, unknown> = {};
  for (const campo of CAMPOS_DE_TEXTO) {
    const valor = busca.get(campo)?.trim();
    if (valor) filtros[campo] = valor;
  }
  for (const campo of CAMPOS_DE_LISTA) {
    const valor = busca.get(campo);
    if (valor) filtros[campo] = valor.split(',').filter(Boolean);
  }
  for (const campo of ['clienteId', 'responsavelId', 'ramo', 'ordem'] as const) {
    const valor = busca.get(campo);
    if (valor) filtros[campo] = valor;
  }
  const periodo: Record<string, string> = {};
  for (const [param, campo] of [
    ['atalho', 'atalho'],
    ['de', 'de'],
    ['ate', 'ate'],
    ['campoData', 'campoData'],
  ] as const) {
    const valor = busca.get(param);
    if (valor) periodo[campo] = valor;
  }
  if (Object.keys(periodo).length > 0) filtros.periodo = periodo;
  return {
    recurso: busca.get('recurso') === 'publicacoes' ? 'publicacoes' : 'prazos',
    filtros: filtros,
  };
}

/** URL do estado; campos vazios ficam de fora. */
export function escreverNaUrl({ recurso, filtros }: EstadoDaBusca): URLSearchParams {
  const busca = new URLSearchParams();
  if (recurso === 'publicacoes') busca.set('recurso', recurso);
  const { periodo, ...resto } = filtros;
  for (const [campo, valor] of Object.entries(resto)) {
    if (Array.isArray(valor)) {
      if (valor.length > 0) busca.set(campo, valor.join(','));
    } else if (typeof valor === 'string' && valor !== '') busca.set(campo, valor);
  }
  for (const [campo, valor] of Object.entries(periodo ?? {})) {
    if (typeof valor === 'string' && valor !== '') busca.set(campo, valor);
  }
  return busca;
}

/** Sem os campos indicados (sem `delete` dinâmico). */
export function omitir<T extends object>(objeto: T, campos: readonly string[]): T {
  return Object.fromEntries(Object.entries(objeto).filter(([c]) => !campos.includes(c))) as T;
}

/** Mudança parcial: `undefined` remove o campo. */
export type Alteracao<T> = { [K in keyof T]?: T[K] | undefined };

/** Sem campos indefinidos, vazios ou listas vazias. */
export function limpar<T extends object>(objeto: Alteracao<T>): T {
  return Object.fromEntries(
    Object.entries(objeto).filter(
      ([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0),
    ),
  ) as T;
}

/** Filtros enviados à API: a busca de publicações não leva os campos só de prazo. */
export function filtrosDoRecurso({ recurso, filtros }: EstadoDaBusca): FiltrosDaTela {
  if (recurso === 'prazos') return filtros;
  const semPrazo = omitir(filtros, SO_DE_PRAZO);
  return filtros.periodo === undefined
    ? semPrazo
    : { ...semPrazo, periodo: { ...filtros.periodo, campoData: 'publicacao' } };
}
