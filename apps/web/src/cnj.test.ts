import { describe, expect, it } from 'vitest';

import { detectarCnj, mascararCnj, situacaoCnj } from './cnj';

const VALIDO = '0000001-68.2026.8.26.0100';

describe('cnj (HU12)', () => {
  it('detecta o número válido dentro de um texto colado, com ou sem pontuação', () => {
    expect(detectarCnj(`Processo nº ${VALIDO} - Intimação`)).toBe(VALIDO);
    expect(detectarCnj('autos 00000016820268260100.')).toBe(VALIDO);
    // O primeiro candidato tem dígito errado; vale o seguinte.
    expect(detectarCnj(`0000001-69.2026.8.26.0100 e ${VALIDO}`)).toBe(VALIDO);
    expect(detectarCnj('0000001-69.2026.8.26.0100')).toBeUndefined();
    expect(detectarCnj('sem número')).toBeUndefined();
  });

  it('mascara conforme a digitação e ignora o excedente', () => {
    expect(mascararCnj('')).toBe('');
    expect(mascararCnj('0000001')).toBe('0000001');
    expect(mascararCnj('000000168')).toBe('0000001-68');
    expect(mascararCnj('0000001682026826')).toBe('0000001-68.2026.8.26');
    expect(mascararCnj('00000016820268260100999')).toBe(VALIDO);
  });

  it('só acusa erro com os 20 dígitos e deduz o tribunal', () => {
    expect(situacaoCnj('0000001-68')).toEqual({ tipo: 'incompleto' });
    expect(situacaoCnj('0000001-69.2026.8.26.0100')).toEqual({ tipo: 'invalido' });
    expect(situacaoCnj('00000016820268260100')).toEqual({
      tipo: 'valido',
      formatado: VALIDO,
      tribunal: 'TJSP',
    });
  });
});
