/** Fuso de Brasília: o padrão do sistema e o dos tribunais sem fuso próprio na curadoria. */
export const FUSO_DE_BRASILIA = 'America/Sao_Paulo';

/**
 * Fuso dos tribunais como a curadora cadastrou na V2 (aba 5, coluna "Fuso do juízo" e
 * observações, assinada em 29/10/2026). Tribunal sem linha aqui: Brasília. Dado, não regra: o
 * fim do prazo nesse fuso é regra do motor (CPC, art. 213, parágrafo único).
 */
const FUSOS: Readonly<Record<string, { readonly fuso: string; readonly outrosFusos: boolean }>> = {
  // V2 (TRF1 e TRF3): "Abrange AC, AM, ..., MT, ..., RO, RR e TO" e "Abrange SP e MS".
  TRF1: { fuso: FUSO_DE_BRASILIA, outrosFusos: true },
  TRF3: { fuso: FUSO_DE_BRASILIA, outrosFusos: true },
  // Abrange o AM, com o oeste em America/Eirunepe (V2, linha do TJAM).
  TRT11: { fuso: 'America/Manaus', outrosFusos: true },
  // V2: "Fusos America/Porto_Velho (UTC-4) e America/Rio_Branco (UTC-5)".
  TRT14: { fuso: 'America/Porto_Velho', outrosFusos: true },
  TRT23: { fuso: 'America/Cuiaba', outrosFusos: false },
  TRT24: { fuso: 'America/Campo_Grande', outrosFusos: false },
  TJAC: { fuso: 'America/Rio_Branco', outrosFusos: false },
  // V2: "municípios do oeste do AM em America/Eirunepe (UTC-5)".
  TJAM: { fuso: 'America/Manaus', outrosFusos: true },
  TJMS: { fuso: 'America/Campo_Grande', outrosFusos: false },
  TJMT: { fuso: 'America/Cuiaba', outrosFusos: false },
  TJRO: { fuso: 'America/Porto_Velho', outrosFusos: false },
  TJRR: { fuso: 'America/Boa_Vista', outrosFusos: false },
};

export interface FusoDoJuizo {
  readonly fuso: string;
  /**
   * O tribunal tem unidades em outro fuso, mais a oeste: o fuso informado termina o prazo mais
   * cedo (na dúvida, a data mais cedo, CLAUDE.md §4.4), e o advogado confere o da unidade.
   */
  readonly outrosFusos: boolean;
}

/** Fuso do juízo pelo tribunal do processo. Sem tribunal conhecido, Brasília. */
export function fusoDoJuizo(tribunal: string | null | undefined): FusoDoJuizo {
  return (
    (tribunal === null || tribunal === undefined ? undefined : FUSOS[tribunal]) ?? {
      fuso: FUSO_DE_BRASILIA,
      outrosFusos: false,
    }
  );
}
