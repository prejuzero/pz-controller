import { Instant, LocalDate } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { normalizarAntecedencias, planejarLembretes } from './lembrete.js';

const d = (iso: string) => {
  const r = LocalDate.analisar(iso);
  if (!r.ok) throw r.erro;
  return r.valor;
};

describe('agenda dos lembretes (HU31)', () => {
  const vencimento = d('2026-11-13');
  const datas = [
    { antecedencia: 5, data: d('2026-11-05') },
    { antecedencia: 2, data: d('2026-11-11') },
    { antecedencia: 1, data: d('2026-11-12') },
    { antecedencia: 0, data: vencimento },
  ];

  it('8h de São Paulo nas escolhidas e insistência às 14h nos dois últimos dias úteis', () => {
    const r = planejarLembretes({
      vencimento,
      datas,
      escolhidas: [5, 2, 1, 0],
      agora: Instant.deIso('2026-11-01T12:00:00.000Z'),
    });
    expect(r.map((l) => `${l.tipo}:${String(l.antecedencia)}:${l.disparoEm.paraIso()}`)).toEqual([
      'antecedencia:5:2026-11-05T11:00:00.000Z',
      'antecedencia:2:2026-11-11T11:00:00.000Z',
      'antecedencia:1:2026-11-12T11:00:00.000Z',
      'insistencia:1:2026-11-12T17:00:00.000Z',
      'antecedencia:0:2026-11-13T11:00:00.000Z',
      'insistencia:0:2026-11-13T17:00:00.000Z',
    ]);
  });

  it('o que já passou fica de fora; insistência vale mesmo sem a antecedência escolhida', () => {
    const r = planejarLembretes({
      vencimento,
      datas,
      escolhidas: [5],
      agora: Instant.deIso('2026-11-12T12:00:00.000Z'),
    });
    expect(r.map((l) => `${l.tipo}:${String(l.antecedencia)}`)).toEqual([
      'insistencia:1',
      'insistencia:0',
    ]);
  });

  it('normaliza antecedências', () => {
    expect(normalizarAntecedencias([0, 2, 2, 5])).toEqual([5, 2, 0]);
  });
});
