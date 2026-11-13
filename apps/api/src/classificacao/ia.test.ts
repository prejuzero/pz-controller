import { FixedClock, Instant } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { adaptadorDeIa, classificadorIaDoAmbiente } from './ia.js';

import type { RegistroDeAdaptadores } from '@pz/integracoes';

// Chaves FICTÍCIAS: nada chama o provedor aqui (só a montagem).
const relogio = new FixedClock(Instant.deIso('2026-11-13T12:00:00.000Z'));
const sem = {
  IA_PROVEDORES: ['anthropic', 'openai', 'gemini'] as const,
  OPENAI_MODELO: 'modelo-openai-ficticio',
  GEMINI_MODELO: 'modelo-gemini-ficticio',
  GEMINI_PLANO: 'gratuito' as const,
  IA_DADOS_FICTICIOS: 'nao' as const,
  IA_ORCAMENTO_DIARIO_USD: 20,
};
const montar = (ambiente: Parameters<typeof classificadorIaDoAmbiente>[0]) => {
  const registros: RegistroDeAdaptadores[] = [];
  const ia = classificadorIaDoAmbiente(ambiente, {} as never, {} as never, relogio, registros);
  return { ia, registros };
};

describe('IA do cadastro assistido na API (PZ-337, ADR-024)', () => {
  it('sem chave, ou Gemini gratuito sem a declaração de dados fictícios: só regras rápidas', () => {
    expect(montar(sem).ia).toBeUndefined();
    expect(montar({ ...sem, GEMINI_API_KEY: 'g' }).ia).toBeUndefined();
  });

  it('um registro por provedor disponível, na ordem configurada', () => {
    const todos = montar({
      ...sem,
      ANTHROPIC_API_KEY: 'a',
      OPENAI_API_KEY: 'o',
      GEMINI_API_KEY: 'g',
      GEMINI_PLANO: 'pago',
    });
    expect(todos.ia).toBeDefined();
    expect(todos.registros).toHaveLength(3);
    expect(montar({ ...sem, GEMINI_API_KEY: 'g', IA_DADOS_FICTICIOS: 'sim' }).ia).toBeDefined();
  });

  it('adaptador de cada provedor', () => {
    expect(adaptadorDeIa({ tipo: 'anthropic', chave: 'a' }, relogio).descritor.id).toBe(
      'anthropic',
    );
    expect(adaptadorDeIa({ tipo: 'openai', chave: 'o', modelo: 'm' }, relogio).descritor.id).toBe(
      'openai',
    );
    const gemini = adaptadorDeIa(
      { tipo: 'gemini', chave: 'g', modelo: 'm', plano: 'pago' },
      relogio,
    );
    expect(gemini.descritor.id).toBe('gemini');
    expect(gemini.criar()).toBeDefined();
  });
});
