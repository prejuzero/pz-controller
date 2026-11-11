import { describe, expect, it } from 'vitest';

import { t } from './index';

import type { ChaveDeMensagem } from './index';

describe('catálogo de mensagens do app (HU63)', () => {
  it('devolve o texto pt-BR da chave', () => {
    expect(t('entrar.titulo')).toBe('Entrar');
    expect(t('app.nome')).toBe('PrejuZero');
  });

  it('chave inexistente falha alto', () => {
    expect(() => t('entrar' as ChaveDeMensagem)).toThrow('mensagem ausente: entrar');
  });
});
