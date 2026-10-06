import {
  ErroCredencialInvalida,
  ErroLimiteExcedido,
  ErroPermanente,
  ErroTransitorio,
} from '@pz/integracoes';

import type { ErroIntegracao } from '@pz/integracoes';

const ID = 'smtp';
const REDE = new Set(['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ECONNREFUSED', 'ECONNRESET']);

interface ErroNodemailer {
  readonly code?: string;
  readonly responseCode?: number;
}

/**
 * Classifica o erro do SMTP (RFC 5321): 4xx é falha temporária (tentar de novo), 5xx permanente;
 * 535 e EAUTH são credencial; 421/450/451/452 indicam servidor ocupado ou cota.
 */
export function classificarErroSmtp(erro: unknown): ErroIntegracao {
  const smtp = (typeof erro === 'object' && erro !== null ? erro : {}) as ErroNodemailer;
  const codigo = smtp.code ?? 'desconhecido';
  const resposta = smtp.responseCode;
  const mensagem = `SMTP ${codigo}${resposta === undefined ? '' : ` (${String(resposta)})`}`;
  const opcoes = { causa: erro };
  if (codigo === 'EAUTH' || resposta === 535 || resposta === 534) {
    return new ErroCredencialInvalida(mensagem, ID, opcoes);
  }
  if (resposta === 421 || resposta === 450 || resposta === 451 || resposta === 452) {
    return new ErroLimiteExcedido(mensagem, ID, opcoes);
  }
  if (resposta !== undefined && resposta >= 500) return new ErroPermanente(mensagem, ID, opcoes);
  if (resposta !== undefined && resposta >= 400) return new ErroTransitorio(mensagem, ID, opcoes);
  if (REDE.has(codigo) || resposta === undefined) return new ErroTransitorio(mensagem, ID, opcoes);
  return new ErroPermanente(mensagem, ID, opcoes);
}
