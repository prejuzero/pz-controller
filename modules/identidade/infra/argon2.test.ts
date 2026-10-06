import { describe, expect, it } from 'vitest';

import { HasherArgon2 } from './argon2.js';
import { GeradorDeTokensSeguro, hashDoToken } from './tokens.js';

const hasher = new HasherArgon2();

describe('Argon2id (parâmetros OWASP)', () => {
  it('gera hash PHC com sal aleatório e verifica só a senha certa', async () => {
    const [a, b] = await Promise.all([
      hasher.gerar('senha bem longa'),
      hasher.gerar('senha bem longa'),
    ]);
    expect(a).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(a).not.toBe(b);
    expect(await hasher.verificar(a, 'senha bem longa')).toBe(true);
    expect(await hasher.verificar(a, 'senha bem longa ')).toBe(false);
  });

  it('a mesma senha digitada com acento composto ou decomposto confere (NFC)', async () => {
    const hash = await hasher.gerar('ação jurídica segura');
    expect(await hasher.verificar(hash, 'ação jurídica segura'.normalize('NFD'))).toBe(true);
  });

  it('hash malformado ou de outro algoritmo não confere (sem exceção)', async () => {
    for (const hash of [
      '',
      'texto',
      '$argon2i$v=19$m=19456,t=2,p=1$AAAA$BBBB',
      '$2b$10$abcdefghijklmnopqrstuv',
    ]) {
      expect(await hasher.verificar(hash, 'x')).toBe(false);
    }
  });

  it('respeita os parâmetros gravados no hash (permite endurecer depois)', async () => {
    const hash = await hasher.gerar('senha bem longa');
    const maisLeve = hash.replace('m=19456', 'm=8192');
    expect(await hasher.verificar(maisLeve, 'senha bem longa')).toBe(false); // outro custo = outro hash
  });
});

describe('tokens de sessão', () => {
  it('256 bits em base64url, únicos; só o SHA-256 é guardado', () => {
    const gerador = new GeradorDeTokensSeguro();
    const token = gerador.novoToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(gerador.novoToken()).not.toBe(token);
    expect(hashDoToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashDoToken(token)).not.toContain(token);
  });
});
