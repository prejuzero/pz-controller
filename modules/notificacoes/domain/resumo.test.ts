import { Instant, LocalDate } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { horarioValido, resumoDevido } from './resumo.js';

describe('horário do resumo diário (HU31)', () => {
  const hoje = LocalDate.de(2026, 11, 3);
  it('devido do horário (São Paulo) até 30 min depois', () => {
    // 07:00 em São Paulo = 10:00 UTC.
    expect(resumoDevido('07:00', hoje, Instant.deIso('2026-11-03T09:59:00.000Z'))).toBe(false);
    expect(resumoDevido('07:00', hoje, Instant.deIso('2026-11-03T10:00:00.000Z'))).toBe(true);
    expect(resumoDevido('07:00', hoje, Instant.deIso('2026-11-03T10:29:59.000Z'))).toBe(true);
    expect(resumoDevido('07:00', hoje, Instant.deIso('2026-11-03T10:30:00.000Z'))).toBe(false);
    expect(resumoDevido('7h', hoje, Instant.deIso('2026-11-03T10:00:00.000Z'))).toBe(false);
  });
  it('valida HH:MM', () => {
    expect([horarioValido('23:59'), horarioValido('24:00'), horarioValido('7:00')]).toEqual([
      true,
      false,
      false,
    ]);
  });
});
