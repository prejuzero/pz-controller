import { describe, expect, it } from 'vitest';

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
