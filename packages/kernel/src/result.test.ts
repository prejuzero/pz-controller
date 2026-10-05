import { describe, expect, it } from 'vitest';

import { err, ok } from './result.js';

import type { Result } from './result.js';

function dividir(dividendo: number, divisor: number): Result<number, string> {
  return divisor === 0 ? err('divisão por zero') : ok(dividendo / divisor);
}

describe('Result', () => {
  it('distingue sucesso e erro pelo campo ok, com estreitamento de tipo', () => {
    const sucesso = dividir(10, 2);
    const falha = dividir(1, 0);

    expect(sucesso).toEqual({ ok: true, valor: 5 });
    expect(falha).toEqual({ ok: false, erro: 'divisão por zero' });
    if (sucesso.ok) expect(sucesso.valor + 1).toBe(6);
    if (!falha.ok) expect(falha.erro.length).toBeGreaterThan(0);
  });

  it('é imutável', () => {
    const resultado = ok({ x: 1 });
    expect(Object.isFrozen(resultado)).toBe(true);
    expect(Object.isFrozen(err('e'))).toBe(true);
  });
});
