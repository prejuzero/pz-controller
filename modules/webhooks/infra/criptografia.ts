import { createHmac, randomBytes } from 'node:crypto';

import type { Criptografia } from '../application/portas.js';

/** HMAC-SHA256 (ADR-023) e segredo de 256 bits com prefixo reconhecível (`whsec_`). */
export class CriptografiaNode implements Criptografia {
  novoSegredo(): string {
    return `whsec_${randomBytes(32).toString('base64url')}`;
  }

  hmac(segredo: string, mensagem: string): string {
    return createHmac('sha256', segredo).update(mensagem, 'utf8').digest('hex');
  }
}
