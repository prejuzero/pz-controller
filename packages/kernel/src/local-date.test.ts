import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { Instant } from './instant.js';
import { DiaDaSemana, LocalDate } from './local-date.js';

// Oráculo só nos testes: o Date em UTC calcula o calendário gregoriano proléptico.
function comoDateUtc(data: LocalDate): Date {
  const resultado = new Date(Date.UTC(2000, 0, 1));
  resultado.setUTCFullYear(data.ano, data.mes - 1, data.dia);
  return resultado;
}

const dataArbitraria = fc
  .date({
    min: new Date('0001-01-01T00:00:00Z'),
    max: new Date('9999-12-31T00:00:00Z'),
    noInvalidDate: true,
  })
  .map((data) => LocalDate.de(data.getUTCFullYear(), data.getUTCMonth() + 1, data.getUTCDate()));

describe('LocalDate', () => {
  it('cria e formata no padrão ISO 8601', () => {
    expect(LocalDate.de(2026, 3, 9).paraIso()).toBe('2026-03-09');
    expect(LocalDate.de(1, 1, 1).paraIso()).toBe('0001-01-01');
    expect(String(LocalDate.de(2026, 12, 31))).toBe('2026-12-31');
    expect(JSON.stringify({ data: LocalDate.de(2026, 10, 5) })).toBe('{"data":"2026-10-05"}');
  });

  it('recusa datas inexistentes ou fora do intervalo', () => {
    expect(() => LocalDate.de(2026, 2, 29)).toThrow(RangeError);
    expect(() => LocalDate.de(2026, 13, 1)).toThrow(RangeError);
    expect(() => LocalDate.de(2026, 4, 31)).toThrow(RangeError);
    expect(() => LocalDate.de(2026, 1, 0)).toThrow(RangeError);
    expect(() => LocalDate.de(0, 1, 1)).toThrow(RangeError);
    expect(() => LocalDate.de(10_000, 1, 1)).toThrow(RangeError);
    expect(() => LocalDate.de(2026, 1.5, 1)).toThrow(RangeError);
  });

  it('respeita anos bissextos, inclusive as regras de século', () => {
    expect(LocalDate.de(2024, 2, 29).paraIso()).toBe('2024-02-29');
    expect(LocalDate.de(2000, 2, 29).paraIso()).toBe('2000-02-29');
    expect(() => LocalDate.de(1900, 2, 29)).toThrow(RangeError);
    expect(() => LocalDate.de(2100, 2, 29)).toThrow(RangeError);
  });

  it('analisa texto ISO e devolve erro de validação para entrada inválida', () => {
    const valida = LocalDate.analisar('2026-10-05');
    expect(valida.ok && valida.valor.igual(LocalDate.de(2026, 10, 5))).toBe(true);

    for (const texto of ['2026-02-30', '2026-10-5', '05/10/2026', '2026-10-05T00:00:00Z', '']) {
      const resultado = LocalDate.analisar(texto);
      expect(resultado.ok).toBe(false);
      if (!resultado.ok) expect(resultado.erro.codigo).toBe('data.invalida');
    }
  });

  it('soma dias atravessando viradas de mês, de ano e o dia 29 de fevereiro', () => {
    expect(LocalDate.de(2026, 1, 31).maisDias(1).paraIso()).toBe('2026-02-01');
    expect(LocalDate.de(2026, 12, 31).maisDias(1).paraIso()).toBe('2027-01-01');
    expect(LocalDate.de(2024, 2, 28).maisDias(1).paraIso()).toBe('2024-02-29');
    expect(LocalDate.de(2024, 2, 29).maisDias(1).paraIso()).toBe('2024-03-01');
    expect(LocalDate.de(2025, 2, 28).maisDias(1).paraIso()).toBe('2025-03-01');
    expect(LocalDate.de(2027, 1, 1).maisDias(-1).paraIso()).toBe('2026-12-31');
    expect(LocalDate.de(2026, 12, 20).maisDias(31).paraIso()).toBe('2027-01-20');
    expect(() => LocalDate.de(2026, 1, 1).maisDias(0.5)).toThrow(RangeError);
    expect(() => LocalDate.de(9999, 12, 31).maisDias(1)).toThrow(RangeError);
  });

  it('calcula o dia da semana', () => {
    expect(LocalDate.de(2026, 10, 5).diaDaSemana()).toBe(DiaDaSemana.segunda);
    expect(LocalDate.de(2026, 10, 4).diaDaSemana()).toBe(DiaDaSemana.domingo);
    expect(LocalDate.de(2026, 10, 10).diaDaSemana()).toBe(DiaDaSemana.sabado);
    expect(LocalDate.de(2024, 2, 29).diaDaSemana()).toBe(DiaDaSemana.quinta);
    expect(LocalDate.de(1, 1, 1).diaDaSemana()).toBe(DiaDaSemana.segunda);
  });

  it('compara datas e conta os dias entre elas', () => {
    const a = LocalDate.de(2026, 12, 20);
    const b = LocalDate.de(2027, 1, 20);
    expect(a.diasAte(b)).toBe(31);
    expect(b.diasAte(a)).toBe(-31);
    expect(a.ehAntesDe(b)).toBe(true);
    expect(b.ehDepoisDe(a)).toBe(true);
    expect(a.ehAntesDe(a)).toBe(false);
    expect(a.comparar(b)).toBeLessThan(0);
    expect(b.comparar(a)).toBeGreaterThan(0);
    expect(a.comparar(LocalDate.de(2026, 12, 20))).toBe(0);
    expect(a.igual(LocalDate.de(2026, 12, 20))).toBe(true);
  });

  it('obtém a data civil de um instante no fuso informado', () => {
    // 02:30 UTC de 05/10 ainda é 04/10 em São Paulo (UTC-3) e em Rio Branco (UTC-5).
    const madrugadaUtc = Instant.deIso('2026-10-05T02:30:00Z');
    expect(LocalDate.doInstante(madrugadaUtc, 'America/Sao_Paulo').paraIso()).toBe('2026-10-04');
    expect(LocalDate.doInstante(madrugadaUtc, 'America/Rio_Branco').paraIso()).toBe('2026-10-04');
    expect(LocalDate.doInstante(madrugadaUtc, 'UTC').paraIso()).toBe('2026-10-05');
    // 04:30 UTC: já é 05/10 em São Paulo, ainda 04/10 em Rio Branco.
    const instante = Instant.deIso('2026-10-05T04:30:00Z');
    expect(LocalDate.doInstante(instante, 'America/Sao_Paulo').paraIso()).toBe('2026-10-05');
    expect(LocalDate.doInstante(instante, 'America/Rio_Branco').paraIso()).toBe('2026-10-04');
    expect(() => LocalDate.doInstante(instante, 'Fuso/Inexistente')).toThrow(RangeError);
  });

  describe('propriedades (calendário gregoriano)', () => {
    it('concorda com o calendário de referência ao somar dias', () => {
      fc.assert(
        fc.property(dataArbitraria, fc.integer({ min: -3650, max: 3650 }), (data, dias) => {
          const esperado = comoDateUtc(data);
          esperado.setUTCDate(esperado.getUTCDate() + dias);
          fc.pre(esperado.getUTCFullYear() >= 1 && esperado.getUTCFullYear() <= 9999);
          const obtido = data.maisDias(dias);
          expect([obtido.ano, obtido.mes, obtido.dia]).toEqual([
            esperado.getUTCFullYear(),
            esperado.getUTCMonth() + 1,
            esperado.getUTCDate(),
          ]);
        }),
      );
    });

    it('soma e diferença são inversas', () => {
      fc.assert(
        fc.property(dataArbitraria, fc.integer({ min: -1000, max: 1000 }), (data, dias) => {
          fc.pre(data.ano > 3 && data.ano < 9996);
          expect(data.diasAte(data.maisDias(dias))).toBe(dias);
          expect(data.maisDias(dias).maisDias(-dias).igual(data)).toBe(true);
        }),
      );
    });

    it('dia da semana avança um por dia e fecha o ciclo em 7', () => {
      fc.assert(
        fc.property(dataArbitraria, (data) => {
          fc.pre(data.ano < 9999);
          expect(data.maisDias(7).diaDaSemana()).toBe(data.diaDaSemana());
          expect(data.maisDias(1).diaDaSemana()).toBe((data.diaDaSemana() + 1) % 7);
          expect(data.diaDaSemana()).toBe(comoDateUtc(data).getUTCDay());
        }),
      );
    });

    it('ISO ida e volta preserva a data', () => {
      fc.assert(
        fc.property(dataArbitraria, (data) => {
          const analisada = LocalDate.analisar(data.paraIso());
          expect(analisada.ok && analisada.valor.igual(data)).toBe(true);
        }),
      );
    });
  });
});
