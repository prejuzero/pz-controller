import { FixedClock, Instant } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { classificadorIaDoAmbiente, planoDeIa } from './ia.js';

import type { RegistroDeAdaptadores } from '@pz/integracoes';

// Chaves FICTÍCIAS: nada chama o provedor aqui (só a montagem).
const relogio = new FixedClock(Instant.deIso('2026-11-11T12:00:00.000Z'));
const sem = {
  GEMINI_MODELO: 'gemini-3.5-flash',
  IA_DADOS_FICTICIOS: 'nao' as const,
  IA_ORCAMENTO_DIARIO_USD: 20,
};
const montar = (ambiente: Parameters<typeof classificadorIaDoAmbiente>[0]) => {
  const registros: RegistroDeAdaptadores[] = [];
  const ia = classificadorIaDoAmbiente(ambiente, {} as never, {} as never, relogio, registros);
  return { ia, registros };
};

describe('IA do cadastro assistido na API (PZ-337)', () => {
  it('sem chave, ou Gemini sem a declaração de dados fictícios: só regras rápidas', () => {
    expect(montar(sem).ia).toBeUndefined();
    expect(montar({ ...sem, GEMINI_API_KEY: 'g' }).ia).toBeUndefined();
  });

  it('com provedor: classificador pela plataforma e adaptador no registro', () => {
    const anthropic = montar({ ...sem, ANTHROPIC_API_KEY: 'a' });
    expect(anthropic.ia).toBeDefined();
    expect(anthropic.registros).toHaveLength(1);
    expect(montar({ ...sem, GEMINI_API_KEY: 'g', IA_DADOS_FICTICIOS: 'sim' }).ia).toBeDefined();
  });

  it('Gemini em todas as tarefas, sem custo de tabela', () => {
    const gemini = planoDeIa({ tipo: 'gemini', chave: 'g', modelo: 'modelo-ficticio' }, relogio);
    expect(gemini.descritor.id).toBe('gemini');
    expect(gemini.criar()).toBeDefined();
    for (const tarefa of Object.values(gemini.configuracao.tarefas)) {
      expect(tarefa.modelos).toEqual([{ provedor: 'gemini', modelo: 'modelo-ficticio' }]);
    }
    expect(planoDeIa({ tipo: 'anthropic', chave: 'a' }, relogio).descritor.id).toBe('anthropic');
  });
});
