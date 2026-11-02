import { describe, expect, it } from 'vitest';

import {
  dataNoFuso,
  diasDaGrade,
  ehDataCivil,
  horaNoFuso,
  navegar,
  porDia,
  somarDias,
} from './grade';

describe('grade do calendário (HU27)', () => {
  it('mês em semanas inteiras de domingo a sábado', () => {
    // Novembro de 2026: começa num domingo e termina numa segunda.
    const nov = diasDaGrade('2026-11-17', 'mes');
    expect(nov[0]).toBe('2026-11-01');
    expect(nov.at(-1)).toBe('2026-12-05');
    expect(nov).toHaveLength(35);
    // Fevereiro de 2028 (bissexto): 29 dias, de terça a terça.
    const fev = diasDaGrade('2028-02-10', 'mes');
    expect(fev[0]).toBe('2028-01-30');
    expect(fev).toContain('2028-02-29');
    expect(fev.at(-1)).toBe('2028-03-04');
  });

  it('semana de domingo a sábado, inclusive na virada do ano', () => {
    expect(diasDaGrade('2026-12-31', 'semana')).toEqual([
      '2026-12-27',
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
  });

  it('navega por mês e por semana', () => {
    expect(navegar('2026-01-31', 'mes', 1)).toBe('2026-02-01');
    expect(navegar('2026-01-15', 'mes', -1)).toBe('2025-12-01');
    expect(navegar('2026-11-03', 'semana', -1)).toBe('2026-10-27');
    expect(somarDias('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('valida datas civis', () => {
    expect(ehDataCivil('2026-11-30')).toBe(true);
    expect(ehDataCivil('2026-02-30')).toBe(false);
    expect(ehDataCivil('30/11/2026')).toBe(false);
    expect(ehDataCivil(null)).toBe(false);
  });

  it('dia e hora do instante em São Paulo, não no fuso do navegador', () => {
    // 01:30Z de 01/12 ainda é 30/11 em São Paulo (UTC−3).
    const instante = new Date('2026-12-01T01:30:00.000Z');
    expect(dataNoFuso(instante)).toBe('2026-11-30');
    expect(horaNoFuso(instante)).toBe('22:30');
    expect(dataNoFuso(instante, 'UTC')).toBe('2026-12-01');
  });

  it('agrupa por dia e descarta itens sem data', () => {
    const mapa = porDia(
      [
        { id: 1, d: '2026-11-03' },
        { id: 2, d: null },
        { id: 3, d: '2026-11-03' },
      ],
      (i) => i.d,
    );
    expect(mapa.get('2026-11-03')?.map((i) => i.id)).toEqual([1, 3]);
    expect(mapa.size).toBe(1);
  });
});
