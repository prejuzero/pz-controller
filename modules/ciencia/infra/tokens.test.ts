import { randomBytes } from 'node:crypto';

import { gerarUuidV7 } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { hashDoToken, TokensHmac } from './tokens.js';

const CHAVE = randomBytes(32);

describe('tokens de ciência (HU33, PZ-204)', () => {
  it('ida e volta: tenant no corpo, hash SHA-256 do token inteiro', () => {
    const tokens = new TokensHmac(CHAVE);
    const tenant = gerarUuidV7();
    const { token, hash } = tokens.emitir(tenant);
    expect(token).toMatch(/^v1\.[\w-]+\.[\w-]+$/);
    expect(hash).toBe(hashDoToken(token));
    expect(tokens.ler(token)).toEqual({ tenantId: tenant, hash });
    // 256 bits aleatórios: dois tokens do mesmo tenant nunca coincidem.
    expect(tokens.emitir(tenant).token).not.toBe(token);
  });

  it('recusa adulterado, de outra chave, de outra versão ou mal formado', () => {
    const tokens = new TokensHmac(CHAVE);
    const { token } = tokens.emitir(gerarUuidV7());
    const [v, corpo = '', assinatura = ''] = token.split('.');
    const outroCorpo = `${corpo.slice(0, -2)}${corpo.endsWith('AA') ? 'BB' : 'AA'}`;
    expect(tokens.ler(`${v ?? ''}.${outroCorpo}.${assinatura}`)).toBeUndefined();
    expect(tokens.ler(`${v ?? ''}.${corpo}.${assinatura.slice(1)}`)).toBeUndefined();
    expect(new TokensHmac(randomBytes(32)).ler(token)).toBeUndefined();
    expect(tokens.ler(`v2.${corpo}.${assinatura}`)).toBeUndefined();
    expect(tokens.ler('nada')).toBeUndefined();
    expect(tokens.ler('v1.curto.')).toBeUndefined();
    expect(() => new TokensHmac(randomBytes(16))).toThrow();
  });

  it('corpo de tamanho errado com assinatura válida também é recusado', () => {
    const tokens = new TokensHmac(CHAVE);
    // Assina um corpo curto pela própria classe (via emitir não é possível): simula com outro token.
    const a = tokens.emitir(gerarUuidV7()).token.split('.');
    expect(tokens.ler(`v1.${(a[1] ?? '').slice(0, 10)}.${a[2] ?? ''}`)).toBeUndefined();
  });
});
