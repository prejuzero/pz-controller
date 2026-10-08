import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { motivoDaRecusa, TAMANHO_MAXIMO_DO_PADRAO } from './padrao-seguro.js';
import { padraoValido } from './regras.js';

describe('padrão seguro contra ReDoS (PZ-316)', () => {
  it.each([
    '\\bcite-se\\b',
    '\\bjulgo\\s+(?:im)?procedente',
    '\\bjulgo\\s+extinto',
    'intime-se.{0,40}contestar',
    '[a-z]+-se\\b',
    '(?:cite|intime)-se',
    '(?<verbo>cite)-se',
    'a{2,5}',
    'x{1}',
    '\\(prazo\\)+',
    '[(]+',
    '[^)]+',
    '[\\]]+',
    'a??b',
    '{abc}',
    'x*',
  ])('aceita o padrão comum de regra rápida %s', (padrao) => {
    expect(motivoDaRecusa(padrao)).toBeUndefined();
    expect(padraoValido(padrao)).toBe(true);
  });

  it.each([
    ['(a+)+', 'grupo'],
    ['(a|a)*', 'grupo'],
    ['(.*)*b', 'grupo'],
    ['(\\w+\\s?)*$', 'grupo'],
    ['(?:ab)+', 'grupo'],
    ['(?:x){2,}', 'grupo'],
    ['((a)?)+', 'grupo'],
    ['(a)\\1', 'retrovisor'],
    ['(?<n>a)\\k<n>', 'retrovisor'],
    ['a(?=b)', 'lookaround'],
    ['a(?!b)', 'lookaround'],
    ['(?<=a)b', 'lookaround'],
    ['(?<!a)b', 'lookaround'],
    ['(', 'mal formada'],
    ['[a-', 'mal formada'],
  ])('recusa %s (%s)', (padrao, motivo) => {
    expect(motivoDaRecusa(padrao)).toContain(motivo);
    expect(padraoValido(padrao)).toBe(false);
  });

  it('grupo opcional (? ou {0,1}) é aceito: não repete', () => {
    expect(motivoDaRecusa('(?:im)?procedente')).toBeUndefined();
    expect(motivoDaRecusa('(?:im){0,1}procedente')).toBeUndefined();
    expect(motivoDaRecusa('(?:im){1}procedente')).toBeUndefined();
  });

  it('recusa padrão acima do tamanho máximo', () => {
    expect(motivoDaRecusa('a'.repeat(TAMANHO_MAXIMO_DO_PADRAO))).toBeUndefined();
    expect(motivoDaRecusa('a'.repeat(TAMANHO_MAXIMO_DO_PADRAO + 1))).toContain('tamanho');
  });

  it('nunca lança e só aceita o que compila (propriedade)', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: fc.constantFrom(...'ab()[]{}|*+?.\\^$,:=!<>k1-'.split('')) }),
        (padrao) => {
          const motivo = motivoDaRecusa(padrao);
          // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- teste: confere que padrão aceito compila
          if (motivo === undefined) expect(() => new RegExp(padrao, 'g')).not.toThrow();
        },
      ),
      { numRuns: 2000 },
    );
  });

  it('padrão aceito não repete grupo: nenhum aceito contém grupo seguido de * + ou {n,}', () => {
    fc.assert(
      fc.property(fc.string({ unit: fc.constantFrom(...'a()*+?|{2,}'.split('')) }), (padrao) => {
        if (motivoDaRecusa(padrao) === undefined) expect(padrao).not.toMatch(/\)(?:[*+]|\{\d+,)/);
      }),
      { numRuns: 2000 },
    );
  });
});
