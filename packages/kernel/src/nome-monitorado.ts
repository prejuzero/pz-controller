/** Limites do nome monitorado (HU42): curto demais traz homônimos demais. */
export const TAMANHO_DO_NOME_MONITORADO = { minimo: 5, maximo: 150 } as const;

/**
 * Forma canônica do nome monitorado na captura (HU42): espaços simples e maiúsculas, para o mesmo
 * nome digitado de jeitos diferentes, em N escritórios, virar um alvo só (a busca do DJEN não
 * diferencia maiúsculas nem acentos). `undefined` fora dos limites de tamanho.
 */
export function nomeMonitoradoCanonico(nome: string): string | undefined {
  const valor = nome.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleUpperCase('pt-BR');
  const { minimo, maximo } = TAMANHO_DO_NOME_MONITORADO;
  return valor.length < minimo || valor.length > maximo ? undefined : valor;
}
