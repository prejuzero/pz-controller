import { SystemClock } from './clock.js';
import { Instant } from './instant.js';

import type { Clock } from './clock.js';

/** UUID em texto minúsculo. A marca impede passar uma string qualquer onde se espera um id. */
export type Uuid = string & { readonly __marca: 'Uuid' };

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const FORMATO_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const relogioPadrao = new SystemClock();

export function ehUuid(valor: unknown): valor is Uuid {
  return typeof valor === 'string' && FORMATO_UUID.test(valor);
}

/**
 * UUIDv7 (RFC 9562): 48 bits de milissegundos desde 1970 seguidos de 74 bits aleatórios.
 * Ordenável pelo tempo de criação, o que mantém os índices de chave primária compactos (CLAUDE.md, seção 9).
 */
export function gerarUuidV7(relogio: Clock = relogioPadrao): Uuid {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let ms = relogio.agora().epochMs;
  for (let posicao = 5; posicao >= 0; posicao -= 1) {
    bytes[posicao] = ms % 256;
    ms = Math.floor(ms / 256);
  }
  const vista = new DataView(bytes.buffer);
  vista.setUint8(6, 0x70 | (vista.getUint8(6) & 0x0f)); // versão 7
  vista.setUint8(8, 0x80 | (vista.getUint8(8) & 0x3f)); // variante RFC 9562
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as Uuid;
}

export function instanteDoUuidV7(id: string): Instant {
  if (!FORMATO_V7.test(id)) throw new RangeError(`Não é um UUIDv7: "${id}"`);
  return Instant.deEpochMs(Number.parseInt(id.slice(0, 8) + id.slice(9, 13), 16));
}
