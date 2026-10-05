import { describe, expect, it } from 'vitest';

import { FixedClock, FUSO_PADRAO, hoje, SystemClock } from './clock.js';
import { Instant } from './instant.js';

describe('Clock', () => {
  it('SystemClock lê o relógio do sistema', () => {
    const antes = Date.now();
    const agora = new SystemClock().agora().epochMs;
    expect(agora).toBeGreaterThanOrEqual(antes);
    expect(agora).toBeLessThanOrEqual(Date.now());
  });

  it('FixedClock devolve sempre o instante definido e avança só quando mandado', () => {
    const relogio = new FixedClock(Instant.deIso('2026-10-05T12:00:00Z'));
    expect(relogio.agora().paraIso()).toBe('2026-10-05T12:00:00.000Z');
    relogio.avancarMs(90_000);
    expect(relogio.agora().paraIso()).toBe('2026-10-05T12:01:30.000Z');
    relogio.definir(Instant.deIso('2027-01-01T00:00:00Z'));
    expect(relogio.agora().paraIso()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('hoje usa America/Sao_Paulo por padrão e aceita o fuso do juízo', () => {
    expect(FUSO_PADRAO).toBe('America/Sao_Paulo');
    const relogio = new FixedClock(Instant.deIso('2026-10-05T02:00:00Z'));
    expect(hoje(relogio).paraIso()).toBe('2026-10-04');
    expect(hoje(relogio, 'UTC').paraIso()).toBe('2026-10-05');
  });
});
