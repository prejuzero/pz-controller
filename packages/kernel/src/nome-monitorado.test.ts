import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { nomeMonitoradoCanonico } from './nome-monitorado.js';

describe('nome monitorado canônico (HU42)', () => {
  it('espaços simples e maiúsculas; fora dos limites de tamanho não há nome', () => {
    expect(nomeMonitoradoCanonico('  Sociedade   Fictícia\nde Advogados ')).toBe(
      'SOCIEDADE FICTÍCIA DE ADVOGADOS',
    );
    expect(nomeMonitoradoCanonico(' abc ')).toBeUndefined();
    expect(nomeMonitoradoCanonico('x'.repeat(151))).toBeUndefined();
    expect(nomeMonitoradoCanonico('x'.repeat(150))).toHaveLength(150);
  });

  it('propriedade: canonizar de novo não muda o nome', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 200 }), (texto) => {
        const valor = nomeMonitoradoCanonico(texto);
        if (valor !== undefined) expect(nomeMonitoradoCanonico(valor)).toBe(valor);
      }),
    );
  });
});
