import { describe, expect, it } from 'vitest';

import { temaDoEsquema, temas } from './tema';

describe('tema do app (HU63)', () => {
  it('segue o esquema do sistema; sem esquema, claro', () => {
    expect(temaDoEsquema('dark')).toBe(temas.escuro);
    expect(temaDoEsquema('light')).toBe(temas.claro);
    expect(temaDoEsquema(null)).toBe(temas.claro);
    expect(temas.claro.cores).not.toEqual(temas.escuro.cores);
  });
});
