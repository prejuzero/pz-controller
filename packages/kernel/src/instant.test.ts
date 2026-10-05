import { describe, expect, it } from 'vitest';

import { Instant } from './instant.js';

describe('Instant', () => {
  it('representa um instante em UTC com precisão de milissegundos', () => {
    const instante = Instant.deEpochMs(1_791_228_000_000);
    expect(instante.epochMs).toBe(1_791_228_000_000);
    expect(instante.paraIso()).toBe('2026-10-05T19:20:00.000Z');
    expect(JSON.stringify({ em: instante })).toBe('{"em":"2026-10-05T19:20:00.000Z"}');
    expect(String(instante)).toBe('2026-10-05T19:20:00.000Z');
  });

  it('analisa ISO 8601 com fuso explícito e normaliza para UTC', () => {
    expect(Instant.deIso('2026-10-05T16:20:00-03:00').paraIso()).toBe('2026-10-05T19:20:00.000Z');
    expect(Instant.deIso('2026-10-05T19:20:00.123Z').epochMs % 1000).toBe(123);
  });

  it('recusa texto sem fuso, inválido ou fora do intervalo', () => {
    expect(() => Instant.deIso('2026-10-05T19:20:00')).toThrow(RangeError);
    expect(() => Instant.deIso('2026-10-05')).toThrow(RangeError);
    expect(() => Instant.deIso('ontem')).toThrow(RangeError);
    expect(() => Instant.deIso('2026-02-30T00:00:00Z')).toThrow(RangeError);
    expect(() => Instant.deIso('2026-13-01T00:00:00Z')).toThrow(RangeError);
    expect(() => Instant.deIso('2026-00-01T00:00:00Z')).toThrow(RangeError);
    expect(() => Instant.deIso('2026-01-00T00:00:00Z')).toThrow(RangeError);
    expect(() => Instant.deIso('2026-01-01T25:00:00Z')).toThrow(RangeError);
    expect(() => Instant.deEpochMs(Number.NaN)).toThrow(RangeError);
    expect(() => Instant.deEpochMs(1.5)).toThrow(RangeError);
    expect(() => Instant.deEpochMs(8.64e15 + 1)).toThrow(RangeError);
  });

  it('analisa sem lançar, devolvendo Result', () => {
    const valido = Instant.analisar('2026-10-05T19:20:00Z');
    expect(valido.ok && valido.valor.epochMs).toBe(1_791_228_000_000);
    const invalido = Instant.analisar('2026-10-05');
    expect(!invalido.ok && invalido.erro.codigo).toBe('instante.invalido');
  });

  it('soma durações e compara instantes', () => {
    const a = Instant.deIso('2026-10-05T19:20:00Z');
    const b = a.maisMs(60_000);
    expect(b.paraIso()).toBe('2026-10-05T19:21:00.000Z');
    expect(a.msAte(b)).toBe(60_000);
    expect(a.ehAntesDe(b)).toBe(true);
    expect(b.ehDepoisDe(a)).toBe(true);
    expect(a.comparar(b)).toBeLessThan(0);
    expect(a.igual(Instant.deEpochMs(a.epochMs))).toBe(true);
    expect(a.igual(b)).toBe(false);
  });
});
