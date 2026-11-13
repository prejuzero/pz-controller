import { describe, expect, it } from 'vitest';

import { configuracaoPadrao } from './padrao.js';
import {
  configuracaoDosProvedores,
  escolherProvedoresIa,
  escolherProvedorIa,
} from './provedor-do-ambiente.js';

import type { AmbienteDaIa } from './provedor-do-ambiente.js';

// Chaves FICTÍCIAS.
const sem: AmbienteDaIa = {
  IA_PROVEDORES: ['anthropic', 'openai', 'gemini'],
  OPENAI_MODELO: 'modelo-openai-ficticio',
  GEMINI_MODELO: 'modelo-gemini-ficticio',
  GEMINI_PLANO: 'gratuito',
  IA_DADOS_FICTICIOS: 'nao',
};
const avisos: unknown[] = [];
const logger = { warn: (...a: unknown[]) => void avisos.push(a) } as never;
const escolher = (a: Partial<AmbienteDaIa>) => escolherProvedoresIa({ ...sem, ...a }, logger);

describe('provedores de IA do ambiente (ADR-022, ADR-024)', () => {
  it('na ordem de IA_PROVEDORES, só os que têm chave; nenhum: IA desligada', () => {
    expect(escolher({ ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o' }).map((e) => e.tipo)).toEqual([
      'anthropic',
      'openai',
    ]);
    expect(
      escolher({
        IA_PROVEDORES: ['openai', 'anthropic'],
        ANTHROPIC_API_KEY: 'a',
        OPENAI_API_KEY: 'o',
      }).map((e) => e.tipo),
    ).toEqual(['openai', 'anthropic']);
    expect(escolher({})).toEqual([]);
    expect(escolherProvedorIa(sem, logger)).toBeUndefined();
  });

  it('Gemini gratuito só com dados fictícios; no plano pago, também com dados reais', () => {
    expect(escolher({ GEMINI_API_KEY: 'g' })).toEqual([]);
    expect(escolher({ GEMINI_API_KEY: 'g', IA_DADOS_FICTICIOS: 'sim' })).toEqual([
      { tipo: 'gemini', chave: 'g', modelo: 'modelo-gemini-ficticio', plano: 'gratuito' },
    ]);
    expect(escolher({ GEMINI_API_KEY: 'g', GEMINI_PLANO: 'pago' })).toEqual([
      { tipo: 'gemini', chave: 'g', modelo: 'modelo-gemini-ficticio', plano: 'pago' },
    ]);
    expect(avisos.length).toBeGreaterThan(0);
  });

  it('configuração: cada tarefa tenta os provedores na ordem (fallback)', () => {
    const base = configuracaoPadrao();
    const config = configuracaoDosProvedores(
      base,
      escolher({
        IA_PROVEDORES: ['gemini', 'anthropic'],
        GEMINI_API_KEY: 'g',
        GEMINI_PLANO: 'pago',
        ANTHROPIC_API_KEY: 'a',
      }),
    );
    for (const [nome, tarefa] of Object.entries(config.tarefas)) {
      const anthropic = base.tarefas[nome]?.modelos.filter((m) => m.provedor === 'anthropic') ?? [];
      expect(tarefa.modelos).toEqual([
        { provedor: 'gemini', modelo: 'modelo-gemini-ficticio' },
        ...anthropic,
      ]);
    }
    expect(config.precos['modelo-gemini-ficticio']).toEqual({ entrada: 0, saida: 0, cacheLido: 0 });
  });
});
