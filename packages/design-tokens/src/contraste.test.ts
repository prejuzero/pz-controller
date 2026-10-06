import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  CONTRASTE_MINIMO_INTERFACE,
  CONTRASTE_MINIMO_TEXTO,
  luminancia,
  razaoContraste,
} from './contraste.js';
import { cores, TEMAS, type PapelCor } from './tokens.js';

const corHex = fc
  .integer({ min: 0, max: 0xff_ff_ff })
  .map((n) => `#${n.toString(16).padStart(6, '0')}`);

describe('razaoContraste', () => {
  it('vai de 1 (mesma cor) a 21 (preto e branco)', () => {
    expect(razaoContraste('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(razaoContraste('#777777', '#777777')).toBe(1);
  });

  it('é simétrica e fica entre 1 e 21', () => {
    fc.assert(
      fc.property(corHex, corHex, (a, b) => {
        const r = razaoContraste(a, b);
        expect(r).toBe(razaoContraste(b, a));
        expect(r).toBeGreaterThanOrEqual(1);
        expect(r).toBeLessThanOrEqual(21 + 1e-9);
      }),
    );
  });

  it('recusa cor fora do formato #rrggbb', () => {
    expect(() => luminancia('azul')).toThrow('Cor inválida');
    expect(() => luminancia('#fff')).toThrow('Cor inválida');
  });
});

// Pares que aparecem juntos na interface: [primeiro plano, fundo].
const PARES_DE_TEXTO: readonly (readonly [PapelCor, PapelCor])[] = [
  ['texto', 'fundo'],
  ['texto', 'superficie'],
  ['texto', 'superficieElevada'],
  ['texto', 'primariaSuave'],
  ['textoSuave', 'fundo'],
  ['textoSuave', 'superficie'],
  ['textoSuave', 'superficieElevada'],
  ['primariaTexto', 'primaria'],
  ['sucessoTexto', 'sucesso'],
  ['alertaTexto', 'alerta'],
  ['perigoTexto', 'perigo'],
  ['infoTexto', 'info'],
  ['iaTexto', 'ia'],
];

const PARES_DE_INTERFACE: readonly (readonly [PapelCor, PapelCor])[] = [
  ['foco', 'fundo'],
  ['foco', 'superficie'],
  ['bordaForte', 'fundo'],
  ['bordaForte', 'superficie'],
  ['primaria', 'fundo'],
  ['perigo', 'fundo'],
];

describe.each(TEMAS)('tema %s atende à WCAG 2.1 AA', (tema) => {
  const paleta = cores[tema];

  it.each(PARES_DE_TEXTO)('texto %s sobre %s ≥ 4,5:1', (frente, fundo) => {
    expect(razaoContraste(paleta[frente], paleta[fundo])).toBeGreaterThanOrEqual(
      CONTRASTE_MINIMO_TEXTO,
    );
  });

  it.each(PARES_DE_INTERFACE)('componente %s sobre %s ≥ 3:1', (frente, fundo) => {
    expect(razaoContraste(paleta[frente], paleta[fundo])).toBeGreaterThanOrEqual(
      CONTRASTE_MINIMO_INTERFACE,
    );
  });
});

describe('paletas', () => {
  it('os dois temas definem os mesmos papéis', () => {
    expect(Object.keys(cores.escuro).sort()).toEqual(Object.keys(cores.claro).sort());
  });
});
