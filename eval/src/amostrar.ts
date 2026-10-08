/**
 * Amostra para a conferência manual da anonimização (PZ-160). Determinística pela semente: quem
 * confere registra a semente e qualquer pessoa refaz a mesma amostra.
 */
export function amostrar<T>(itens: readonly T[], tamanho: number, semente: number): T[] {
  const sorteio = mulberry32(semente);
  const copia = [...itens];
  // Fisher-Yates parcial: só as primeiras posições interessam.
  const n = Math.min(Math.max(0, Math.trunc(tamanho)), copia.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(sorteio() * (copia.length - i));
    const atual = copia[i] as T;
    copia[i] = copia[j] as T;
    copia[j] = atual;
  }
  return copia.slice(0, n);
}

/** Gerador pseudoaleatório pequeno e reprodutível (não criptográfico; não precisa ser). */
function mulberry32(semente: number): () => number {
  let estado = semente >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
