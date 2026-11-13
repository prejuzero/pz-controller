import {
  ErroCredencialInvalida,
  ErroLimiteExcedido,
  ErroPermanente,
  ErroTransitorio,
} from '@pz/integracoes';

import type { ErroIntegracao } from '@pz/integracoes';

const ID = 'openai';

/**
 * Classifica a resposta HTTP de erro da API da OpenAI pelo status (nunca pelo texto): 401/403 é
 * credencial; 429 é limite ou cota; 5xx e 408 são passageiros; o resto (400, 404, 413, 422) é
 * permanente.
 */
export function classificarStatusOpenAi(status: number): ErroIntegracao {
  const mensagem = `OpenAI HTTP ${String(status)}`;
  if (status === 401 || status === 403) return new ErroCredencialInvalida(mensagem, ID);
  if (status === 429) return new ErroLimiteExcedido(mensagem, ID);
  if (status >= 500 || status === 408) return new ErroTransitorio(mensagem, ID);
  return new ErroPermanente(mensagem, ID);
}

/** Falha antes da resposta (rede, DNS, timeout, cancelamento): passageira. */
export function classificarFalhaDeRede(erro: unknown): ErroIntegracao {
  return new ErroTransitorio('OpenAI: falha de conexão', ID, { causa: erro });
}
