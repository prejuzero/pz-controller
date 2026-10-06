import { describe, expect, it } from 'vitest';

import { formatarDataCivil, formatarInstante } from './formatar';

describe('formatação', () => {
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
