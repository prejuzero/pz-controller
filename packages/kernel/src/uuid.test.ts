import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { FixedClock } from './clock.js';
import { Instant } from './instant.js';
import { ehUuid, gerarUuidV7, instanteDoUuidV7 } from './uuid.js';

const FORMATO_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('UUIDv7', () => {
  it('segue o formato da RFC 9562 (versão 7, variante 10)', () => {
    for (let i = 0; i < 100; i += 1) {
      expect(gerarUuidV7()).toMatch(FORMATO_V7);
    }
  });

  it('codifica o instante do relógio nos 48 bits iniciais', () => {
    const relogio = new FixedClock(Instant.deIso('2026-10-05T19:20:00.123Z'));
    const id = gerarUuidV7(relogio);
    expect(instanteDoUuidV7(id).paraIso()).toBe('2026-10-05T19:20:00.123Z');
  });

  it('é ordenável pelo tempo de criação', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 47 }),
        fc.integer({ min: 1, max: 10_000_000 }),
        (ms, delta) => {
          const anterior = gerarUuidV7(new FixedClock(Instant.deEpochMs(ms)));
          const posterior = gerarUuidV7(new FixedClock(Instant.deEpochMs(ms + delta)));
          expect(anterior < posterior).toBe(true);
        },
      ),
    );
  });

  it('não repete em sequência no mesmo milissegundo', () => {
    const relogio = new FixedClock(Instant.deIso('2026-10-05T19:20:00Z'));
    const ids = new Set(Array.from({ length: 10_000 }, () => gerarUuidV7(relogio)));
    expect(ids.size).toBe(10_000);
  });

  it('reconhece UUIDs válidos', () => {
    expect(ehUuid(gerarUuidV7())).toBe(true);
    expect(ehUuid('0199B5E2-0000-7000-8000-000000000000')).toBe(false);
    expect(ehUuid('nao-e-uuid')).toBe(false);
    expect(ehUuid(42)).toBe(false);
    expect(() => instanteDoUuidV7('nao-e-uuid')).toThrow(RangeError);
  });
});
