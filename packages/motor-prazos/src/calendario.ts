import type { LocalDate } from '@pz/kernel';

/**
 * Efeito de um dia do calendário forense sobre a contagem (ADR-007: o calendário chega por
 * interface; o motor decide o efeito).
 * - `sem-expediente`: feriado, recesso ou dia sem expediente forense (CPC, art. 216).
 * - `suspensao-de-prazos`: ato do tribunal que suspende os prazos sem fechar o fórum.
 * - `indisponibilidade`: indisponibilidade certificada do sistema; só prorroga início ou
 *   vencimento (CPC, art. 224, §1º; Lei 11.419/2006, art. 10, §2º), não interrompe a contagem.
 */
export const EFEITOS = ['sem-expediente', 'suspensao-de-prazos', 'indisponibilidade'] as const;
export type Efeito = (typeof EFEITOS)[number];

/** Evento do calendário num dia, com o ato normativo que o fundamenta (CLAUDE.md, seção 4.4). */
export interface Ocorrencia {
  readonly efeito: Efeito;
  readonly motivo: string;
  readonly atoNormativo: string;
  readonly urlAto: string;
}

/** Calendário da jurisdição do processo, já filtrado pelo módulo calendario. Puro e síncrono. */
export interface CalendarioForense {
  ocorrencias(data: LocalDate): readonly Ocorrencia[];
  /**
   * Os feriados municipais da comarca foram levantados. Falso: o motor calcula com o que há e
   * avisa o advogado (curadoria V2, aba 8).
   */
  readonly feriadosLocaisVerificados: boolean;
}

export interface OcorrenciaDatada extends Ocorrencia {
  readonly data: LocalDate;
}

/** Calendário a partir de uma lista de ocorrências datadas (adaptadores e testes). */
export function calendarioDeOcorrencias(
  lista: readonly OcorrenciaDatada[],
  { feriadosLocaisVerificados = false }: { feriadosLocaisVerificados?: boolean } = {},
): CalendarioForense {
  const porData = new Map<string, Ocorrencia[]>();
  for (const { data, ...ocorrencia } of lista) {
    const chave = data.paraIso();
    porData.set(chave, [...(porData.get(chave) ?? []), ocorrencia]);
  }
  return { ocorrencias: (data) => porData.get(data.paraIso()) ?? [], feriadosLocaisVerificados };
}
