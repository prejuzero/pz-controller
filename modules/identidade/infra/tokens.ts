import { createHash, randomBytes } from 'node:crypto';

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
