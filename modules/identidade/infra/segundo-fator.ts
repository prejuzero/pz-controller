import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import type { Cifra, SegredosDoSegundoFator } from '../application/portas.js';

const TAG = 16;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function paraBase32(dados: Uint8Array): string {
  let bits = 0;
  let valor = 0;
  let saida = '';
  for (const byte of dados) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      saida += BASE32.charAt((valor >>> (bits - 5)) & 31);
      bits -= 5;
    }
  }
  if (bits > 0) saida += BASE32.charAt((valor << (5 - bits)) & 31);
  return saida;
}

export function deBase32(texto: string): Buffer {
  let bits = 0;
  let valor = 0;
  const bytes: number[] = [];
  for (const caractere of texto.replace(/=+$/, '').toUpperCase()) {
    const indice = BASE32.indexOf(caractere);
    if (indice < 0) throw new Error('base32 inválido');
    valor = (valor << 5) | indice;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** HOTP (RFC 4226) com HMAC-SHA1 e truncamento dinâmico; TOTP é o HOTP do passo de tempo. */
export function hotp(chave: Uint8Array, contador: number, digitos = 6): string {
  const mensagem = Buffer.alloc(8);
  mensagem.writeBigUInt64BE(BigInt(contador));
  const hmac = createHmac('sha1', chave).update(mensagem).digest();
  const deslocamento = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const binario = hmac.readUInt32BE(deslocamento) & 0x7fffffff;
  return String(binario % 10 ** digitos).padStart(digitos, '0');
}

/** TOTP padrão dos aplicativos (Google Authenticator, Authy, 1Password): SHA-1, 6 dígitos, 30 s. */
export class SegredosTotp implements SegredosDoSegundoFator {
  novoSegredo(): string {
    return paraBase32(randomBytes(20)); // 160 bits, recomendado pela RFC 4226
  }

  codigo(segredo: string, passo: number): string {
    return hotp(deBase32(segredo), passo);
  }

  /** 10 caracteres base32 (50 bits), em dois grupos: XXXXX-XXXXX. */
  novoCodigoDeRecuperacao(): string {
    const texto = paraBase32(randomBytes(7)).slice(0, 10);
    return `${texto.slice(0, 5)}-${texto.slice(5)}`;
  }

  hashDoCodigoDeRecuperacao(codigo: string): string {
    return createHash('sha256').update(codigo.replace(/[\s-]/g, '').toUpperCase()).digest('hex');
  }

  uri(segredo: string, email: string): string {
    const rotulo = encodeURIComponent(`PrejuZero:${email}`);
    return `otpauth://totp/${rotulo}?secret=${segredo}&issuer=PrejuZero&algorithm=SHA1&digits=6&period=30`;
  }

  iguais(a: string, b: string): boolean {
    const [x, y] = [Buffer.from(a), Buffer.from(b)];
    return x.length === y.length && timingSafeEqual(x, y);
  }
}

/**
 * AES-256-GCM com a chave da aplicação (CHAVE_CIFRAGEM; KMS em produção, HU72). Formato
 * `v1.<iv>.<tag>.<cifrado>` em base64url: a versão permite trocar algoritmo ou chave depois.
 */
export class CifraAesGcm implements Cifra {
  readonly #chave: Buffer;

  constructor(chaveBase64: string) {
    this.#chave = Buffer.from(chaveBase64, 'base64');
    if (this.#chave.length !== 32) throw new Error('A chave de cifragem deve ter 32 bytes');
  }

  cifrar(texto: string): string {
    const iv = randomBytes(12);
    const cifrador = createCipheriv('aes-256-gcm', this.#chave, iv, { authTagLength: TAG });
    const cifrado = Buffer.concat([cifrador.update(texto, 'utf8'), cifrador.final()]);
    return ['v1', iv, cifrador.getAuthTag(), cifrado]
      .map((parte) => (typeof parte === 'string' ? parte : parte.toString('base64url')))
      .join('.');
  }

  decifrar(cifrado: string): string {
    const [versao, iv, tag, dados] = cifrado.split('.');
    if (versao !== 'v1' || iv === undefined || tag === undefined || dados === undefined) {
      throw new Error('Formato cifrado desconhecido');
    }
    // Tamanho da tag fixo: sem isso, uma tag truncada (mais fácil de forjar) seria aceita.
    const decifrador = createDecipheriv('aes-256-gcm', this.#chave, Buffer.from(iv, 'base64url'), {
      authTagLength: TAG,
    });
    decifrador.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decifrador.update(Buffer.from(dados, 'base64url')),
      decifrador.final(),
    ]).toString('utf8');
  }
}
