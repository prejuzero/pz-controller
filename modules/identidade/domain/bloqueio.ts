const MINUTO = 60_000;

/** A cada 10 falhas seguidas numa janela de 24 h, a conta é bloqueada temporariamente. */
export const FALHAS_PARA_BLOQUEAR = 10;
export const JANELA_DE_FALHAS_MS = 24 * 60 * MINUTO;

/**
 * Bloqueio progressivo (HU06, OWASP ASVS V2.2): 10 falhas → 15 min; 20 → 1 h; 30 ou mais → 24 h.
 * Devolve a duração em ms quando a falha atual dispara um bloqueio, ou undefined.
 */
export function duracaoDoBloqueio(falhas: number): number | undefined {
  if (falhas < FALHAS_PARA_BLOQUEAR || falhas % FALHAS_PARA_BLOQUEAR !== 0) return undefined;
  if (falhas >= 3 * FALHAS_PARA_BLOQUEAR) return 24 * 60 * MINUTO;
  if (falhas >= 2 * FALHAS_PARA_BLOQUEAR) return 60 * MINUTO;
  return 15 * MINUTO;
}
