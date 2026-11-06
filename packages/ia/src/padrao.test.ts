import { describe, expect, it } from 'vitest';

import { comProvedorAlternativo } from './configuracao.js';
import { configuracaoPadrao, promptsPadrao } from './padrao.js';

describe('configuração e prompts padrão', () => {
  it('carregam e validam; a classificação usa Haiku como primário (HU21)', () => {
    expect(configuracaoPadrao().tarefas['classificar-ato']?.modelos[0]).toEqual({
      provedor: 'anthropic',
      modelo: 'claude-haiku-4-5',
    });
    expect(promptsPadrao().versao('classificar-ato')).toMatch(/^classificar-ato@\d+\.\d+\.\d+$/);
  });
});

describe('provedor alternativo (ADR-022)', () => {
  it('todas as tarefas num só provedor e modelo, com preço; o padrão não muda', () => {
    const base = configuracaoPadrao();
    const local = comProvedorAlternativo(base, {
      provedor: 'gemini',
      modelo: 'modelo-ficticio',
      preco: { entrada: 0, saida: 0, cacheLido: 0 },
      fonteDoPreco: 'chave gratuita (FICTÍCIO)',
    });
    for (const tarefa of Object.values(local.tarefas)) {
      expect(tarefa.modelos).toEqual([{ provedor: 'gemini', modelo: 'modelo-ficticio' }]);
    }
    expect(local.precos['modelo-ficticio']).toEqual({ entrada: 0, saida: 0, cacheLido: 0 });
    expect(Object.values(configuracaoPadrao().tarefas)[0]?.modelos[0]?.provedor).toBe('anthropic');
  });
});
