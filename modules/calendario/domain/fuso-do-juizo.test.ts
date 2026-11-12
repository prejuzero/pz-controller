import { describe, expect, it } from 'vitest';

import { FUSO_DE_BRASILIA, fusoDoJuizo } from './fuso-do-juizo.js';
import { jurisdicaoDoProcesso } from './jurisdicao-do-processo.js';

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

  it('com o município da comarca, o fuso exato do cadastro da curadoria, sem aviso (PZ-331)', () => {
    // Eirunepé (AM, IBGE 1301407): oeste do AM, America/Eirunepe (UTC-5), mais a oeste que Manaus.
    expect(fusoDoJuizo('TJAM', '1301407')).toEqual({
      fuso: 'America/Eirunepe',
      outrosFusos: false,
    });
    expect(fusoDoJuizo('TJAM', '1302603')).toEqual({ fuso: 'America/Manaus', outrosFusos: false });
    // TRF1 (vários fusos) em Cruzeiro do Sul (AC): o fuso do município, não o de Brasília.
    const cruzeiro = jurisdicaoDoProcesso({
      tribunal: 'TRF1',
      comarca: 'Subseção Judiciária de Cruzeiro do Sul',
    }).jurisdicao;
    expect(fusoDoJuizo('TRF1', cruzeiro.municipioIbge)).toEqual({
      fuso: 'America/Rio_Branco',
      outrosFusos: false,
    });
    // Rio Branco existe no AC e no MT, ambos no TRF1: não se escolhe; fica o fim mais cedo, com aviso.
    const ambiguo = jurisdicaoDoProcesso({ tribunal: 'TRF1', comarca: 'Rio Branco' }).jurisdicao;
    expect(ambiguo.municipioIbge).toBeUndefined();
    expect(fusoDoJuizo('TRF1', ambiguo.municipioIbge)).toEqual({
      fuso: FUSO_DE_BRASILIA,
      outrosFusos: true,
    });
    // Município fora do cadastro de fusos: o do tribunal, com o aviso.
    expect(fusoDoJuizo('TJAM', '9999999')).toEqual({ fuso: 'America/Manaus', outrosFusos: true });
  });
});
