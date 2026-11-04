import { createHash } from 'node:crypto';

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { codigoDeVerificacao, lerCodigo } from './verificacao.js';

const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');
const TENANT = '01a10e00-0000-7000-8000-0000000f0001';
const registros = [
  { sequencia: 3, hash: 'c'.repeat(64) },
  { sequencia: 1, hash: 'a'.repeat(64) },
];

describe('código de verificação do histórico (HU35)', () => {
  it('independe da ordem de entrada e se lê de volta', () => {
    const codigo = codigoDeVerificacao(TENANT, registros, sha256);
    expect(codigo).toBe(codigoDeVerificacao(TENANT, [...registros].reverse(), sha256));
    expect(lerCodigo(codigo)).toEqual({ tenantId: TENANT, resumo: codigo.split('.')[1] });
  });

  it('qualquer hash alterado muda o código (propriedade)', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[0-9a-f]{64}$/), (outro) => {
        fc.pre(outro !== 'a'.repeat(64));
        const alterado = [{ sequencia: 1, hash: outro }, registros[0] ?? registros[1]];
        expect(codigoDeVerificacao(TENANT, alterado as typeof registros, sha256)).not.toBe(
          codigoDeVerificacao(TENANT, registros, sha256),
        );
      }),
    );
  });

  it('código mal formado não é lido', () => {
    for (const ruim of [
      '',
      'x',
      `${TENANT}.curto`,
      `${TENANT}.${'g'.repeat(64)}`,
      `../${'a'.repeat(64)}`,
    ])
      expect(lerCodigo(ruim)).toBeUndefined();
  });
});
