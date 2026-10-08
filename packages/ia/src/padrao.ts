import tarefas from '../configuracao/tarefas.json' with { type: 'json' };
import classificarAto from '../prompts/classificar-ato.json' with { type: 'json' };
import resumirPublicacao from '../prompts/resumir-publicacao.json' with { type: 'json' };

import { lerConfiguracaoDasTarefas } from './configuracao.js';
import { RegistroDePrompts } from './prompts.js';

import type { ConfiguracaoDasTarefas } from './configuracao.js';

/**
 * Configuração e prompts versionados do repositório, embutidos no build (as apps não leem
 * arquivo em execução). Validados ao carregar: erro derruba o boot, nunca em silêncio.
 */
export function configuracaoPadrao(): ConfiguracaoDasTarefas {
  return lerConfiguracaoDasTarefas(tarefas);
}

export function promptsPadrao(): RegistroDePrompts {
  return new RegistroDePrompts([classificarAto, resumirPublicacao]);
}
