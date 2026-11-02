import { FiltroGlobal as Esquema } from '@pz/contracts';

/** Campos do filtro global (HU27, RF43), com os mesmos nomes do contrato e da busca (HU28). */
export const CAMPOS_DO_FILTRO_GLOBAL = [
  'de',
  'ate',
  'responsavelId',
  'tribunal',
  'clienteId',
] as const;
export type CampoDoFiltroGlobal = (typeof CAMPOS_DO_FILTRO_GLOBAL)[number];
export type FiltroGlobal = Partial<Record<CampoDoFiltroGlobal, string>>;

/** Telas que aplicam o filtro: o menu leva o filtro atual a elas. */
export const TELAS_COM_FILTRO_GLOBAL: readonly string[] = ['/', '/prazos', '/calendario', '/busca'];

/**
 * Filtro global a partir da URL. Cada campo passa pelo schema do contrato; o inválido é ignorado
 * (link antigo ou editado à mão não quebra a tela). Período invertido: fica só o início.
 */
export function lerFiltroGlobal(busca: URLSearchParams): FiltroGlobal {
  const filtro: FiltroGlobal = {};
  for (const campo of CAMPOS_DO_FILTRO_GLOBAL) {
    const valor = busca.get(campo);
    if (valor === null) continue;
    const lido = Esquema.esquema.shape[campo].safeParse(valor);
    if (lido.success && lido.data !== undefined) filtro[campo] = lido.data;
  }
  if (filtro.de !== undefined && filtro.ate !== undefined && filtro.ate < filtro.de) {
    delete filtro.ate;
  }
  return filtro;
}

/** URL com o filtro trocado; os demais parâmetros da tela (ex.: visão do calendário) ficam. */
export function comFiltroGlobal(busca: URLSearchParams, filtro: FiltroGlobal): URLSearchParams {
  const nova = new URLSearchParams(busca);
  for (const campo of CAMPOS_DO_FILTRO_GLOBAL) {
    const valor = filtro[campo]?.trim();
    if (valor === undefined || valor === '') nova.delete(campo);
    else nova.set(campo, valor);
  }
  return nova;
}

/** Link do menu com o filtro atual, quando a tela de destino o aplica. */
export function hrefComFiltro(href: string, busca: URLSearchParams): string {
  if (!TELAS_COM_FILTRO_GLOBAL.includes(href)) return href;
  const query = comFiltroGlobal(new URLSearchParams(), lerFiltroGlobal(busca)).toString();
  return query === '' ? href : `${href}?${query}`;
}

/** Só os campos indicados (cada tela envia à API o que o endpoint aceita). */
export function campos<C extends CampoDoFiltroGlobal>(
  filtro: FiltroGlobal,
  aceitos: readonly C[],
): Partial<Record<C, string>> {
  return Object.fromEntries(
    Object.entries(filtro).filter(([c]) => (aceitos as readonly string[]).includes(c)),
  ) as Partial<Record<C, string>>;
}
