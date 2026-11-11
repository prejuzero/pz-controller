import { describe, expect, it } from 'vitest';

import { escolherProvedorIa } from './provedor-do-ambiente.js';

describe('provedor de IA do ambiente (ADR-022)', () => {
  const sem = { GEMINI_MODELO: 'gemini-3.5-flash', IA_DADOS_FICTICIOS: 'nao' as const };
  const avisos: unknown[] = [];
  const logger = { warn: (...a: unknown[]) => void avisos.push(a) } as never;
  const escolher = (a: Parameters<typeof escolherProvedorIa>[0]) => escolherProvedorIa(a, logger);

  it('Anthropic tem preferência; sem chave nenhuma, a IA fica desligada', () => {
    expect(escolher({ ...sem, ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g' })).toEqual({
      tipo: 'anthropic',
      chave: 'a',
    });
    expect(escolher(sem)).toBeUndefined();
  });

  it('Gemini só liga com a declaração de dados fictícios', () => {
    expect(escolher({ ...sem, GEMINI_API_KEY: 'g' })).toBeUndefined();
    expect(escolher({ ...sem, GEMINI_API_KEY: 'g', IA_DADOS_FICTICIOS: 'sim' })).toEqual({
      tipo: 'gemini',
      chave: 'g',
      modelo: 'gemini-3.5-flash',
    });
    expect(avisos.length).toBeGreaterThanOrEqual(3);
  });
});
