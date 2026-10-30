import { LocalDate } from '@pz/kernel';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { ATALHOS, resolverAtalho } from './periodo.js';

const d = (iso: string) => {
  const r = LocalDate.analisar(iso);
  if (!r.ok) throw r.erro;
  return r.valor;
};
const iso = (p: { de?: LocalDate; ate?: LocalDate }) => [p.de?.paraIso(), p.ate?.paraIso()];

describe('atalhos de período (RF45)', () => {
  // 2026-12-31 é quinta-feira: vira de semana, mês e ano.
  const hoje = d('2026-12-31');

  it('hoje, amanhã e próximos 30 dias', () => {
    expect(iso(resolverAtalho('hoje', hoje))).toEqual(['2026-12-31', '2026-12-31']);
    expect(iso(resolverAtalho('amanha', hoje))).toEqual(['2027-01-01', '2027-01-01']);
    expect(iso(resolverAtalho('proximos-30-dias', hoje))).toEqual(['2026-12-31', '2027-01-30']);
  });

  it('semana de segunda a domingo, inclusive na virada do ano', () => {
    expect(iso(resolverAtalho('esta-semana', hoje))).toEqual(['2026-12-28', '2027-01-03']);
    expect(iso(resolverAtalho('proxima-semana', hoje))).toEqual(['2027-01-04', '2027-01-10']);
    // Domingo ainda é a semana que começou na segunda anterior.
    expect(iso(resolverAtalho('esta-semana', d('2027-01-03')))).toEqual([
      '2026-12-28',
      '2027-01-03',
    ]);
  });

  it('este mês, com fevereiro bissexto', () => {
    expect(iso(resolverAtalho('este-mes', hoje))).toEqual(['2026-12-01', '2026-12-31']);
    expect(iso(resolverAtalho('este-mes', d('2028-02-10')))).toEqual(['2028-02-01', '2028-02-29']);
  });

  it('vencidos: até ontem, sem início', () => {
    expect(iso(resolverAtalho('vencidos', d('2027-01-01')))).toEqual([undefined, '2026-12-31']);
  });

  it('propriedade: o intervalo é válido e, salvo "vencidos", contém ou segue hoje', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 3000 }), fc.constantFrom(...ATALHOS), (n, atalho) => {
        const dia = d('2025-01-01').maisDias(n);
        const { de, ate } = resolverAtalho(atalho, dia);
        if (ate === undefined) throw new Error('todo atalho tem fim');
        expect(!de?.ehDepoisDe(ate)).toBe(true);
        if (atalho === 'vencidos') expect(ate.ehAntesDe(dia)).toBe(true);
        else expect(ate.ehAntesDe(dia)).toBe(false);
      }),
    );
  });
});
