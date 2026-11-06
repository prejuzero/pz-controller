import { describe, expect, it } from 'vitest';

import { decidirResumo, trechoLiteral } from './resumo.js';

// Teor FICTÍCIO.
const TEOR =
  'Intime-se a parte autora para, no prazo de 15 (quinze) dias,\n  manifestar-se sobre a contestação. Publicada em 02/03/2027.';

describe('trecho literal do teor (HU62)', () => {
  it('aceita cópia fiel, com espaços e quebras de linha diferentes', () => {
    expect(trechoLiteral(TEOR, 'no prazo de 15 (quinze) dias, manifestar-se')).toBe(true);
    expect(trechoLiteral(TEOR, '  Publicada em 02/03/2027.  ')).toBe(true);
  });

  it('recusa paráfrase, palavra trocada, trecho vazio ou curto demais', () => {
    expect(trechoLiteral(TEOR, 'no prazo de quinze dias')).toBe(false);
    expect(trechoLiteral(TEOR, 'Intime-se a parte ré')).toBe(false);
    expect(trechoLiteral(TEOR, '   ')).toBe(false);
    expect(trechoLiteral(TEOR, 'dias')).toBe(false);
  });
});

describe('decisão do resumo (HU62)', () => {
  const ok = {
    tipo: 'ok' as const,
    resumo: 'Pede manifestação da parte autora sobre a contestação; há prazo no texto original.',
    providencia: 'Manifestar-se sobre a contestação.',
    trechos: ['manifestar-se sobre a contestação'],
    modelo: 'modelo-ficticio',
    versaoPrompt: 'resumir-publicacao@0.3.0',
  };

  it('saída válida com trechos literais vira resumo "ok"', () => {
    expect(decidirResumo(TEOR, ok)).toEqual({
      situacao: 'ok',
      texto: ok.resumo,
      providencia: ok.providencia,
      trechos: ok.trechos,
      modelo: ok.modelo,
      versaoPrompt: ok.versaoPrompt,
      motivo: null,
    });
  });

  it('trecho que não está no teor ou saída inválida: revisão manual, sem texto exibível', () => {
    expect(decidirResumo(TEOR, { ...ok, trechos: ['a parte ré foi condenada'] })).toMatchObject({
      situacao: 'revisao_manual',
      texto: null,
      motivo: 'trecho-fora-do-teor',
    });
    expect(decidirResumo(TEOR, { tipo: 'invalida' })).toMatchObject({
      situacao: 'revisao_manual',
      motivo: 'saida-invalida',
      modelo: null,
    });
    expect(decidirResumo(TEOR, { tipo: 'sem-orcamento' })).toBeUndefined();
  });
});
