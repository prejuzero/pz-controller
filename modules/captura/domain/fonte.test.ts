import { describe, expect, it } from 'vitest';

import {
  alvoPrecisaDeAlerta,
  aposFalhaDaFonte,
  aposSucessoDaFonte,
  FALHAS_PARA_ALERTAR_ALVO,
  FALHAS_PARA_DEGRADAR,
} from './fonte.js';

import type { EstadoDaFonte } from './fonte.js';

const operacional: EstadoDaFonte = { situacao: 'operacional', falhasConsecutivas: 0 };

describe('saúde da fonte (HU19)', () => {
  it('degrada só ao atingir o limite de falhas seguidas, uma vez', () => {
    let estado = operacional;
    const transicoes = [];
    for (let i = 0; i < FALHAS_PARA_DEGRADAR + 2; i++) {
      const m = aposFalhaDaFonte(estado);
      transicoes.push(m.transicao);
      estado = m.estado;
    }
    expect(transicoes.filter((t) => t === 'degradou')).toHaveLength(1);
    expect(transicoes[FALHAS_PARA_DEGRADAR - 1]).toBe('degradou');
    expect(estado).toEqual({ situacao: 'degradada', falhasConsecutivas: FALHAS_PARA_DEGRADAR + 2 });
  });

  it('o primeiro sucesso restabelece e zera; sucesso em fonte operacional não transiciona', () => {
    expect(aposSucessoDaFonte({ situacao: 'degradada', falhasConsecutivas: 9 })).toEqual({
      estado: operacional,
      transicao: 'restabeleceu',
    });
    expect(aposSucessoDaFonte({ situacao: 'operacional', falhasConsecutivas: 2 })).toEqual({
      estado: operacional,
      transicao: 'nenhuma',
    });
  });

  it('alvo alerta uma vez por sequência, ao atingir o limite', () => {
    expect(alvoPrecisaDeAlerta(FALHAS_PARA_ALERTAR_ALVO - 1)).toBe(false);
    expect(alvoPrecisaDeAlerta(FALHAS_PARA_ALERTAR_ALVO)).toBe(true);
    expect(alvoPrecisaDeAlerta(FALHAS_PARA_ALERTAR_ALVO + 1)).toBe(false);
  });
});
