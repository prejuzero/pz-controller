import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { motivoDaRecusa, TAMANHO_MAXIMO_DO_PADRAO } from './padrao-seguro.js';
import { padraoValido } from './regras.js';

describe('padrão seguro contra ReDoS (PZ-316)', () => {
  it.each([
    '\\bcite-se\\b',
    '\\bjulgo\\s{1,5}(?:im)?procedente',
    '\\bjulgo\\s{1,5}extinto',
    'intime-se.{0,40}contestar',
    '[a-z]{1,20}-se\\b',
    '(?:cite|intime)-se',
    '(?<verbo>cite)-se',
    'a{2,5}',
    'x{1}',
    '\\(prazo\\){1,2}',
    '[(]{1,3}',
    '[^)]{0,30}',
    '[\\]]?',
    'a??b',
    '{abc}',
    'x{0,3}',
    'a.{0,30}b.{0,30}c',
  ])('aceita o padrão comum de regra rápida %s', (padrao) => {
    expect(motivoDaRecusa(padrao)).toBeUndefined();
    expect(padraoValido(padrao)).toBe(true);
  });

  it.each([
    ['(a+)+', 'ilimitada'],
    ['(a{1,3}){1,3}', 'grupo'],
    ['(a|a)*', 'grupo'],
    ['(.*)*b', 'ilimitada'],
    ['(\\w+\\s?)*$', 'ilimitada'],
    ['(?:ab)+', 'grupo'],
    ['(?:x){2,}', 'grupo'],
    ['((a)?)+', 'grupo'],
    ['a.*b.*c', 'ilimitada'],
    ['\\s*\\s*\\s*x', 'ilimitada'],
    ['a+', 'ilimitada'],
    ['a{2,}', 'ilimitada'],
    ['\\(prazo\\)+', 'ilimitada'],
    ['a.{0,40}b.{0,40}c', 'repetições demais'],
    ['(?:a{0,9})?b{0,9}c{0,9}d?', 'repetições demais'],
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

  it('orçamento de repetição: produto dos limites (n + 1 cada) até o teto', () => {
    expect(motivoDaRecusa('a{0,9}b{0,9}c{0,9}')).toBeUndefined();
    expect(motivoDaRecusa('a{0,9}b{0,9}c{0,9}d{0,1}')).toContain('repetições demais');
    expect(motivoDaRecusa('a?'.repeat(9))).toBeUndefined();
    expect(motivoDaRecusa('a?'.repeat(10))).toContain('repetições demais');
    expect(motivoDaRecusa('a{0,9}?'.repeat(3))).toBeUndefined();
  });

  it('o pior padrão aceito percorre teor longo sem retrocesso polinomial (PZ-321)', () => {
    const padrao = 'a.{0,30}b.{0,30}c';
    expect(motivoDaRecusa(padrao)).toBeUndefined();
    const teor = 'ab'.repeat(25_000);
    const inicio = performance.now();
    // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- teste: padrão literal aceito pelo validador
    expect([...teor.matchAll(new RegExp(padrao, 'g'))]).toEqual([]);
    // Folga larga para CI lento: o mesmo teor com 'a.*b.*c' leva minutos.
    expect(performance.now() - inicio).toBeLessThan(2000);
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

  it('padrão aceito não tem repetição ilimitada: nenhum aceito contém * + ou {n,} (propriedade)', () => {
    fc.assert(
      fc.property(fc.string({ unit: fc.constantFrom(...'a()*+?|{2,}'.split('')) }), (padrao) => {
        if (motivoDaRecusa(padrao) === undefined) expect(padrao).not.toMatch(/[*+]|\{\d+,\}/);
      }),
      { numRuns: 2000 },
    );
  });
});
