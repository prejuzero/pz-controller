import { describe, expect, it } from 'vitest';

import { temaNativo } from './nativo.js';
import { cores, espacamento } from './tokens.js';

describe('temaNativo', () => {
  it('usa a paleta do tema pedido e medidas em número', () => {
    const tema = temaNativo('escuro');
    expect(tema.cores).toEqual(cores.escuro);
    expect(tema.espacamento).toBe(espacamento);
    expect(tema.tamanhosFonte.base.tamanho).toBe(16);
  });

  it('converte a sombra para shadow* e elevation', () => {
    expect(temaNativo('claro').sombras.md).toEqual({
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 4,
    });
  });

  it('devolve uma cópia da paleta', () => {
    const tema = temaNativo('claro');
    tema.cores.primaria = '#000000';
    expect(cores.claro.primaria).not.toBe('#000000');
  });
});
