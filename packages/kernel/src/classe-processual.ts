/** Tamanho aceito do nome de uma classe processual (TPU do CNJ), já na forma canônica. */
export const TAMANHO_DA_CLASSE_PROCESSUAL = { minimo: 3, maximo: 200 } as const;

/**
 * Nome canônico da classe processual informada pelo DJEN ("nomeClasse", Tabelas Processuais
 * Unificadas do CNJ): sem acentos, em maiúsculas e com espaços simples. O DJEN manda a mesma classe
 * com caixa e acentuação irregulares ("PROCEDIMENTO COMUM CíVEL"); a forma canônica é a chave da
 * correspondência classe → ramo aprovada pela curadoria. `undefined` fora dos limites de tamanho.
 */
export function classeProcessualCanonica(nome: string): string | undefined {
  const valor = nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  const { minimo, maximo } = TAMANHO_DA_CLASSE_PROCESSUAL;
  return valor.length < minimo || valor.length > maximo ? undefined : valor;
}
