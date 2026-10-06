import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { duracaoDoBloqueio } from './bloqueio.js';

const MIN = 60_000;

describe('bloqueio progressivo', () => {
  it('bloqueia na 10ª, 20ª e 30ª falha por 15 min, 1 h e 24 h', () => {
    expect([9, 10, 11, 19, 20, 30, 40].map(duracaoDoBloqueio)).toEqual([
      undefined,
      15 * MIN,
      undefined,
      undefined,
      60 * MIN,
      24 * 60 * MIN,
      24 * 60 * MIN,
    ]);
  });

  it('propriedade: só múltiplos de 10 bloqueiam, e a duração nunca diminui', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 500 }), (falhas) => {
        const duracao = duracaoDoBloqueio(falhas);
        expect(duracao !== undefined).toBe(falhas >= 10 && falhas % 10 === 0);
        if (duracao !== undefined && falhas >= 20) {
          expect(duracao).toBeGreaterThanOrEqual(duracaoDoBloqueio(falhas - 10) ?? 0);
        }
      }),
    );
  });
});
