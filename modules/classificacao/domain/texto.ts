/**
 * Texto para casar padrões: minúsculo e sem acento, **com o mesmo comprimento** do original, para
 * que as posições (evidência) apontem para o teor como foi publicado.
 */
export function normalizar(teor: string): string {
  let saida = '';
  for (const caractere of teor.toLowerCase()) {
    const base = caractere.normalize('NFD').charAt(0);
    // Só troca quando a base ocupa o mesmo espaço (letras latinas acentuadas: 1 unidade UTF-16).
    saida += base.length === caractere.length ? base : caractere;
  }
  return saida;
}

export interface Evidencia {
  /** Posição inicial no teor (unidades UTF-16, como String.prototype.slice). */
  readonly inicio: number;
  readonly fim: number;
  readonly trecho: string;
}

export const evidencia = (teor: string, inicio: number, fim: number): Evidencia => ({
  inicio,
  fim,
  trecho: teor.slice(inicio, fim),
});
