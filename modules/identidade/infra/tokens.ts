import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import type { GeradorDeTokens } from '../application/portas.js';

export class GeradorDeTokensSeguro implements GeradorDeTokens {
  /** 256 bits de aleatoriedade criptográfica, em base64url (seguro em cookie e cabeçalho). */
  novoToken(): string {
    return randomBytes(32).toString('base64url');
  }
}

/** O token nunca é guardado: só o SHA-256 dele (vazamento do armazenamento não vira sessão). */
export function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** O segredo confere com o hash guardado, em tempo constante (não vaza por tempo de resposta). */
export function segredoConfere(segredo: string, hash: string): boolean {
  const calculado = Buffer.from(hashDoToken(segredo), 'hex');
  const guardado = Buffer.from(hash, 'hex');
  return calculado.length === guardado.length && timingSafeEqual(calculado, guardado);
}

/** `code_challenge` S256 do PKCE: base64url(SHA-256(verificador)) (RFC 7636, seção 4.2). */
export function desafioPkce(verificador: string): string {
  return createHash('sha256').update(verificador, 'ascii').digest('base64url');
}
