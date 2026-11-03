import { LocalDate } from '@pz/kernel';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  exigeConferencia,
  MAXIMO_DIAS_DA_CONFERENCIA,
  PERIODICIDADE_PADRAO,
  situacaoDaConferencia,
} from './conferencia.js';

const d = (iso: string) => {
  const r = LocalDate.analisar(iso);
  if (!r.ok) throw r.erro;
  return r.valor;
};

describe('conferência de painel (HU36)', () => {
  it('exige conferência: sigiloso ou fora da cobertura automática', () => {
    expect(exigeConferencia({ cobertura: 'automatica', sigiloso: false })).toBe(false);
    expect(exigeConferencia({ cobertura: 'automatica', sigiloso: true })).toBe(true);
    expect(exigeConferencia({ cobertura: 'parcial', sigiloso: false })).toBe(true);
    expect(exigeConferencia({ cobertura: 'manual', sigiloso: false })).toBe(true);
  });

  it('periodicidade padrão abaixo dos 10 dias corridos da ciência tácita', () => {
    expect(PERIODICIDADE_PADRAO).toBe(5);
    expect(MAXIMO_DIAS_DA_CONFERENCIA).toBeLessThan(10);
  });

  it('lembra no dia devido e a cada período; registro reinicia a contagem', () => {
    const ref = d('2026-11-02');
    const s = (hoje: string) => situacaoDaConferencia(ref, d(hoje), 5);
    expect(s('2026-11-06')).toMatchObject({
      proxima: '2026-11-07',
      lembrarHoje: false,
      atrasada: false,
    });
    expect(s('2026-11-07')).toMatchObject({ lembrarHoje: true, atrasada: false });
    expect(s('2026-11-08')).toMatchObject({ lembrarHoje: false, atrasada: true });
    expect(s('2026-11-12')).toMatchObject({ lembrarHoje: true, atrasada: true });
    // Conferiu no dia 08: a próxima passa para o dia 13.
    expect(situacaoDaConferencia(d('2026-11-08'), d('2026-11-12'), 5)).toMatchObject({
      proxima: '2026-11-13',
      lembrarHoje: false,
      atrasada: false,
    });
  });

  it('propriedade: lembra exatamente nos múltiplos da periodicidade', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9 }), fc.integer({ min: 0, max: 400 }), (n, dias) => {
        const ref = d('2026-01-01');
        const s = situacaoDaConferencia(ref, ref.maisDias(dias), n);
        expect(s.lembrarHoje).toBe(dias > 0 && dias % n === 0);
        expect(s.atrasada).toBe(dias > n);
      }),
    );
  });
});
