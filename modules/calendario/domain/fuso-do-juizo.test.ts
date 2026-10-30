import { describe, expect, it } from 'vitest';

import { FUSO_DE_BRASILIA, fusoDoJuizo } from './fuso-do-juizo.js';

describe('fusoDoJuizo', () => {
  it('usa o fuso que a curadoria cadastrou para o tribunal', () => {
    expect(fusoDoJuizo('TJAC')).toEqual({ fuso: 'America/Rio_Branco', outrosFusos: false });
    expect(fusoDoJuizo('TRT24')).toEqual({ fuso: 'America/Campo_Grande', outrosFusos: false });
  });

  it('marca o tribunal com unidades em mais de um fuso', () => {
    expect(fusoDoJuizo('TJAM')).toEqual({ fuso: 'America/Manaus', outrosFusos: true });
    expect(fusoDoJuizo('TRT14').outrosFusos).toBe(true);
  });

  it('tribunal sem fuso próprio, desconhecido ou ausente fica em Brasília', () => {
    for (const tribunal of ['TJSP', 'XYZ', null, undefined]) {
      expect(fusoDoJuizo(tribunal)).toEqual({ fuso: FUSO_DE_BRASILIA, outrosFusos: false });
    }
  });
});
