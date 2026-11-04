import type { RegistroEncadeado, Sha256 } from './cadeia.js';

/**
 * Código de verificação de um trecho da trilha (HU35, RF87): o tenant (para a consulta pública
 * rodar no tenant, com RLS) e o SHA-256 da lista "sequência:hash" do trecho, em ordem. Mudar um
 * registro muda o hash dele; mudar o hash muda o código.
 */
export function codigoDeVerificacao(
  tenantId: string,
  registros: readonly Pick<RegistroEncadeado, 'sequencia' | 'hash'>[],
  sha256: Sha256,
): string {
  const ordenados = [...registros].sort((a, b) => a.sequencia - b.sequencia);
  return `${tenantId}.${sha256(ordenados.map((r) => `${String(r.sequencia)}:${r.hash}`).join('\n'))}`;
}

const FORMATO = /^[0-9a-f-]{36}\.[0-9a-f]{64}$/;

/** Lê o código; `undefined` se mal formado (nem chega ao banco). */
export function lerCodigo(codigo: string): { tenantId: string; resumo: string } | undefined {
  if (!FORMATO.test(codigo)) return undefined;
  const ponto = codigo.indexOf('.');
  return { tenantId: codigo.slice(0, ponto), resumo: codigo.slice(ponto + 1) };
}
