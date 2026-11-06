import {
  ErroCredencialInvalida,
  ErroLimiteExcedido,
  ErroPermanente,
  ErroTransitorio,
} from '@pz/integracoes';

import type { ErroIntegracao } from '@pz/integracoes';

const ID = 'gemini';

/**
 * Classifica a resposta HTTP de erro da API do Gemini pelo status (nunca pelo texto): 401/403 é
 * credencial; 429 é cota; 5xx (o 503 "alta demanda" é frequente), 408 e falha de rede são
 * passageiros; o 404 sem corpo, que o serviço devolve de forma intermitente, também; o resto
 * (400, 404 com corpo, 413) é permanente.
 */
export function classificarStatusGemini(status: number, corpo: string): ErroIntegracao {
  const mensagem = `Gemini HTTP ${String(status)}`;
  if (status === 401 || status === 403) return new ErroCredencialInvalida(mensagem, ID);
  if (status === 429) return new ErroLimiteExcedido(mensagem, ID);
  if (status >= 500 || status === 408 || (status === 404 && corpo.trim() === '')) {
    return new ErroTransitorio(mensagem, ID);
  }
  return new ErroPermanente(mensagem, ID);
}

/** Falha antes da resposta (rede, DNS, timeout, cancelamento): passageira. */
export function classificarFalhaDeRede(erro: unknown): ErroIntegracao {
  return new ErroTransitorio('Gemini: falha de conexão', ID, { causa: erro });
}
