import { describe, expect, it } from 'vitest';

import { alertasDaCaptura } from './alertas.js';

describe('alertas da captura (HU19)', () => {
  it('registram métrica e log sem lançar', () => {
    expect(() => {
      alertasDaCaptura.fonteDegradada('djen', 3);
      alertasDaCaptura.fonteRestabelecida('djen', 2);
      alertasDaCaptura.alvoFalhando('01a10e00-0000-7000-8000-000000000001' as never, 5);
    }).not.toThrow();
  });
});
