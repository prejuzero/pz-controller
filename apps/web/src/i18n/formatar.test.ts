import { describe, expect, it } from 'vitest';

import { anoNoFuso, formatarDataCivil, formatarInstante, instanteDaDataHora } from './formatar';

describe('formatação', () => {
  it('ano no fuso America/Sao_Paulo, não em UTC', () => {
    expect(anoNoFuso(new Date('2026-01-01T02:00:00Z'))).toBe(2025);
    expect(anoNoFuso(new Date('2026-01-01T03:00:00Z'))).toBe(2026);
  });

  it('data civil sem conversão de fuso', () => {
    expect(formatarDataCivil('2026-01-01')).toBe('01/01/2026');
    expect(() => formatarDataCivil('01/01/2026')).toThrow(RangeError);
  });

  it('instante no fuso America/Sao_Paulo (UTC-3)', () => {
    // 02:00 UTC de 01/01/2026 ainda é 31/12/2025 em São Paulo.
    expect(formatarInstante('2026-01-01T02:00:00Z')).toBe('31/12/2025, 23:00');
    // Fuso do juízo (ex.: Rio Branco, UTC-5).
    expect(formatarInstante('2026-01-01T02:00:00Z', 'America/Rio_Branco')).toBe(
      '31/12/2025, 21:00',
    );
    expect(() => formatarInstante('ontem')).toThrow(RangeError);
  });
});

describe('instanteDaDataHora', () => {
  it('lê a hora no fuso de Brasília ou no informado', () => {
    expect(instanteDaDataHora('2026-11-10', '14:00')).toBe('2026-11-10T17:00:00.000Z');
    expect(instanteDaDataHora('2026-11-10', '14:00', 'America/Rio_Branco')).toBe(
      '2026-11-10T19:00:00.000Z',
    );
    expect(() => instanteDaDataHora('10/11/2026', '14:00')).toThrow(RangeError);
  });
});
