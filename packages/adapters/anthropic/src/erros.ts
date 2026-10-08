import Anthropic from '@anthropic-ai/sdk';
import {
  ErroCredencialInvalida,
  ErroLimiteExcedido,
  ErroPermanente,
  ErroTransitorio,
} from '@pz/integracoes';

import type { ErroIntegracao } from '@pz/integracoes';

const ID = 'anthropic';

/**
 * Classifica o erro do SDK da Anthropic pelas classes tipadas (nunca pelo texto): 401/403 é
 * credencial; 429 é cota; 529 (sobrecarga), 5xx, 408/409 e falha de conexão ou timeout são
 * passageiros; o resto (400, 404, 413, 422) é permanente.
 */
export function classificarErroAnthropic(erro: unknown): ErroIntegracao {
  const opcoes = { causa: erro };
  if (erro instanceof Anthropic.APIConnectionError) {
    return new ErroTransitorio('Anthropic: falha de conexão', ID, opcoes);
  }
  if (erro instanceof Anthropic.APIError) {
    // O SDK tipa o status de forma genérica: só número é status HTTP.
    const bruto: unknown = erro.status;
    const status = typeof bruto === 'number' ? bruto : undefined;
    const mensagem = `Anthropic HTTP ${status === undefined ? '?' : String(status)}`;
    if (
      erro instanceof Anthropic.AuthenticationError ||
      erro instanceof Anthropic.PermissionDeniedError
    ) {
      return new ErroCredencialInvalida(mensagem, ID, opcoes);
    }
    if (erro instanceof Anthropic.RateLimitError)
      return new ErroLimiteExcedido(mensagem, ID, opcoes);
    if (status === undefined || status >= 500 || status === 408 || status === 409) {
      return new ErroTransitorio(mensagem, ID, opcoes);
    }
    return new ErroPermanente(mensagem, ID, opcoes);
  }
  return new ErroPermanente('Anthropic: erro inesperado', ID, opcoes);
}
