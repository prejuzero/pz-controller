import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { CifraAesGcm, deBase32, hotp, paraBase32, SegredosTotp } from './segundo-fator.js';

const CHAVE_RFC = Buffer.from('12345678901234567890', 'ascii');

describe('HOTP/TOTP (vetores oficiais das RFCs)', () => {
  it('RFC 4226, apêndice D: HOTP de 6 dígitos para os contadores 0 a 9', () => {
    const esperados = [
      '755224',
      '287082',
      '359152',
      '969429',
      '338314',
      '254676',
      '287922',
      '162583',
      '399871',
      '520489',
    ];
    expect(esperados.map((_, contador) => hotp(CHAVE_RFC, contador))).toEqual(esperados);
  });

  it('RFC 6238, apêndice B: TOTP SHA-1 de 8 dígitos (passo de 30 s)', () => {
    const vetores: [number, string][] = [
      [59, '94287082'],
      [1_111_111_109, '07081804'],
      [1_111_111_111, '14050471'],
      [1_234_567_890, '89005924'],
      [2_000_000_000, '69279037'],
      [20_000_000_000, '65353130'],
    ];
    for (const [segundos, codigo] of vetores)
      expect(hotp(CHAVE_RFC, Math.floor(segundos / 30), 8)).toBe(codigo);
  });

  it('base32 (RFC 4648) ida e volta, sem padding', () => {
    expect(paraBase32(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(deBase32('MZXW6YTBOI').toString()).toBe('foobar');
    const aleatorio = randomBytes(20);
    expect(deBase32(paraBase32(aleatorio))).toEqual(aleatorio);
    expect(() => deBase32('1!')).toThrow('base32');
  });

  it('segredo de 160 bits, URI otpauth, códigos de recuperação e hash normalizado', () => {
    const segredos = new SegredosTotp();
    const segredo = segredos.novoSegredo();
    expect(deBase32(segredo)).toHaveLength(20);
    expect(segredos.codigo(segredo, 1)).toMatch(/^\d{6}$/);
    expect(segredos.uri(segredo, 'ana@exemplo.invalid')).toBe(
      `otpauth://totp/PrejuZero%3Aana%40exemplo.invalid?secret=${segredo}&issuer=PrejuZero&algorithm=SHA1&digits=6&period=30`,
    );
    const codigo = segredos.novoCodigoDeRecuperacao();
    expect(codigo).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
    expect(segredos.hashDoCodigoDeRecuperacao(codigo.toLowerCase().replace('-', ' '))).toBe(
      segredos.hashDoCodigoDeRecuperacao(codigo),
    );
    expect(segredos.iguais('123456', '123456')).toBe(true);
    expect(segredos.iguais('123456', '12345')).toBe(false);
  });
});

describe('cifra AES-256-GCM', () => {
  const chave = randomBytes(32).toString('base64');

  it('cifra com IV aleatório e decifra; adulteração ou outra chave falham', () => {
    const cifra = new CifraAesGcm(chave);
    const [a, b] = [cifra.cifrar('segredo'), cifra.cifrar('segredo')];
    expect(a).toMatch(/^v1\./);
    expect(a).not.toBe(b);
    expect(cifra.decifrar(a)).toBe('segredo');
    const partes = a.split('.');
    const adulterado = [...partes.slice(0, 3), Buffer.from('outro').toString('base64url')].join(
      '.',
    );
    expect(() => cifra.decifrar(adulterado)).toThrow();
    expect(() => new CifraAesGcm(randomBytes(32).toString('base64')).decifrar(a)).toThrow();
    expect(() => cifra.decifrar('v2.a.b.c')).toThrow('Formato');
    expect(() => new CifraAesGcm(randomBytes(16).toString('base64'))).toThrow('32 bytes');
  });
});
