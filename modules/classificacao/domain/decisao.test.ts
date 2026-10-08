import { describe, expect, it } from 'vitest';

import { CONFIANCA_MINIMA, decidir } from './decisao.js';

import type { ResultadoDasRegras } from './regras.js';

// Teor e taxonomia FICTÍCIOS.
const TEOR = 'Vistos. Cite-se o réu para contestar em 15 (quinze) dias.';
const TAXONOMIA = ['citacao', 'sentenca'];
const nenhuma: ResultadoDasRegras = { situacao: 'nenhuma' };
const porRegra = (confianca: number): ResultadoDasRegras => ({
  situacao: 'classificada',
  tipoAto: 'citacao',
  regra: { codigo: 'r-citacao', versao: 2 },
  confianca,
  evidencias: [{ inicio: 8, fim: 15, trecho: 'Cite-se' }],
  prazoCitado: {
    quantidade: 15,
    unidade: 'dias',
    unidadeImplicita: false,
    divergente: false,
    evidencia: { inicio: 39, fim: 55, trecho: '15 (quinze) dias' },
  },
});
const ia = (tipoAto: string, confianca: number, trecho = 'Cite-se o réu') => ({
  tipo: 'ok' as const,
  tipoAto,
  confianca,
  trecho,
  versaoPrompt: 'classificar-ato@0.1.0',
  modelo: 'claude-haiku-4-5',
});

describe('decisão da classificação (HU21)', () => {
  it('regra com confiança suficiente decide sem IA, com prazo citado', () => {
    expect(decidir({ teor: TEOR, taxonomia: TAXONOMIA, regras: porRegra(0.9) })).toMatchObject({
      origem: 'regra',
      situacao: 'ok',
      tipoAto: 'citacao',
      regra: { codigo: 'r-citacao', versao: 2 },
      prazoCitado: { quantidade: 15, unidade: 'dias' },
    });
  });

  it('precisa da IA quando a regra não decide', () => {
    expect(decidir({ teor: TEOR, taxonomia: TAXONOMIA, regras: porRegra(0.6) })).toBeUndefined();
    expect(decidir({ teor: TEOR, taxonomia: TAXONOMIA, regras: nenhuma })).toBeUndefined();
  });

  it('IA confiante, na taxonomia e com trecho literal: ok, com a posição da evidência', () => {
    expect(
      decidir({ teor: TEOR, taxonomia: TAXONOMIA, regras: nenhuma, ia: ia('citacao', 0.93) }),
    ).toMatchObject({
      origem: 'ia',
      situacao: 'ok',
      tipoAto: 'citacao',
      confianca: 0.93,
      evidencias: [{ inicio: 8, fim: 21, trecho: 'Cite-se o réu' }],
      versaoPrompt: 'classificar-ato@0.1.0',
      modelo: 'claude-haiku-4-5',
    });
  });

  it.each([
    ['confiança abaixo de 0,85', ia('citacao', CONFIANCA_MINIMA - 0.01), 'citacao'],
    ['ato desconhecido', ia('desconhecido', 0.99), null],
    ['fora da taxonomia', ia('agravo-inventado', 0.99), null],
    ['trecho que não está no teor', ia('citacao', 0.99, 'texto inventado'), 'citacao'],
  ])('%s: a confirmar', (_caso, saida, tipoAto) => {
    expect(decidir({ teor: TEOR, taxonomia: TAXONOMIA, regras: nenhuma, ia: saida })).toMatchObject(
      { origem: 'ia', situacao: 'a_confirmar', tipoAto },
    );
  });

  // Limiar exato do card PZ-159: 0,84 fica a confirmar, 0,85 já decide (CLAUDE.md §11).
  it.each([
    [0.84, 'a_confirmar'],
    [0.85, 'ok'],
  ])('limiar: IA com confiança %s fica %s', (confianca, situacao) => {
    expect(
      decidir({ teor: TEOR, taxonomia: TAXONOMIA, regras: nenhuma, ia: ia('citacao', confianca) }),
    ).toMatchObject({ origem: 'ia', situacao, tipoAto: 'citacao' });
  });

  it('limiar: regra com 0,84 chama a IA; com 0,85 decide sozinha', () => {
    expect(decidir({ teor: TEOR, taxonomia: TAXONOMIA, regras: porRegra(0.84) })).toBeUndefined();
    expect(decidir({ teor: TEOR, taxonomia: TAXONOMIA, regras: porRegra(0.85) })).toMatchObject({
      origem: 'regra',
      situacao: 'ok',
    });
  });

  it('saída inválida: revisão manual; IA desligada ou sem orçamento: a confirmar com a regra fraca', () => {
    expect(
      decidir({ teor: TEOR, taxonomia: TAXONOMIA, regras: nenhuma, ia: { tipo: 'invalida' } }),
    ).toMatchObject({ origem: 'ia', situacao: 'revisao_manual', motivo: 'saida-invalida' });
    expect(
      decidir({
        teor: TEOR,
        taxonomia: TAXONOMIA,
        regras: porRegra(0.6),
        ia: { tipo: 'desligada' },
      }),
    ).toMatchObject({
      origem: 'regra',
      situacao: 'a_confirmar',
      tipoAto: 'citacao',
      motivo: 'ia-desligada',
    });
    expect(
      decidir({ teor: TEOR, taxonomia: TAXONOMIA, regras: nenhuma, ia: { tipo: 'sem-orcamento' } }),
    ).toMatchObject({
      origem: 'nenhuma',
      situacao: 'a_confirmar',
      tipoAto: null,
      motivo: 'sem-orcamento',
    });
  });
});
