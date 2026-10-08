import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { amostrar } from './amostrar.js';

describe('amostra para conferência manual (PZ-160)', () => {
  it('a mesma semente refaz a mesma amostra', () => {
    const itens = Array.from({ length: 50 }, (_, i) => i);
    expect(amostrar(itens, 10, 42)).toEqual(amostrar(itens, 10, 42));
    expect(amostrar(itens, 10, 42)).not.toEqual(amostrar(itens, 10, 43));
  });

  it('propriedade: tamanho limitado, sem repetição, só itens do conjunto', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer()),
        fc.integer({ min: -5, max: 60 }),
        fc.integer(),
        (itens, n, s) => {
          const amostra = amostrar(itens, n, s);
          expect(amostra).toHaveLength(Math.min(Math.max(0, n), itens.length));
          expect(new Set(amostra).size).toBe(amostra.length);
          expect(amostra.every((x) => itens.includes(x))).toBe(true);
        },
      ),
    );
  });
});
