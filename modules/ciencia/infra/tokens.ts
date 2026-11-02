import { createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

import type { TokensDeCiencia } from '../application/ciencia.js';
import type { Uuid } from '@pz/kernel';

const VERSAO = 'v1';
/** Rótulo do HKDF: a chave do HMAC da ciência não serve para nada além disto. */
const ROTULO = 'pz:ciencia:token:v1';
const ALEATORIO = 32; // 256 bits

const paraUuid = (b: Buffer) => {
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}` as Uuid;
};
const doUuid = (uuid: string) => Buffer.from(uuid.replaceAll('-', ''), 'hex');

/**
 * Token de ciência (HU33): `v1.<tenant (16 bytes) + 256 bits aleatórios>.<HMAC-SHA256>`, em
 * base64url. A assinatura barra token adulterado sem consultar o banco; o tenant no corpo põe a
 * busca sob RLS. Guarda-se só o SHA-256 do token inteiro.
 */
export class TokensHmac implements TokensDeCiencia {
  readonly #chave: Buffer;

  /** `chaveMestra`: a CHAVE_CIFRAGEM (32 bytes); a da ciência é derivada por HKDF. */
  constructor(chaveMestra: Buffer) {
    if (chaveMestra.length < 32) throw new Error('chave mestra da ciência com menos de 32 bytes');
    this.#chave = Buffer.from(hkdfSync('sha256', chaveMestra, Buffer.alloc(0), ROTULO, 32));
  }

  emitir(tenantId: Uuid): { token: string; hash: string } {
    const corpo = Buffer.concat([doUuid(tenantId), randomBytes(ALEATORIO)]).toString('base64url');
    const token = `${VERSAO}.${corpo}.${this.#assinar(corpo)}`;
    return { token, hash: hashDoToken(token) };
  }

  ler(token: string): { tenantId: Uuid; hash: string } | undefined {
    const partes = token.split('.');
    if (partes.length !== 3 || partes[0] !== VERSAO) return undefined;
    const [, corpo = '', assinatura = ''] = partes;
    const esperada = Buffer.from(this.#assinar(corpo), 'base64url');
    const recebida = Buffer.from(assinatura, 'base64url');
    if (recebida.length !== esperada.length || !timingSafeEqual(recebida, esperada))
      return undefined;
    const bytes = Buffer.from(corpo, 'base64url');
    if (bytes.length !== 16 + ALEATORIO) return undefined;
    return { tenantId: paraUuid(bytes.subarray(0, 16)), hash: hashDoToken(token) };
  }

  #assinar(corpo: string): string {
    return createHmac('sha256', this.#chave).update(`${VERSAO}.${corpo}`).digest('base64url');
  }
}

export const hashDoToken = (token: string) => createHash('sha256').update(token).digest('hex');
