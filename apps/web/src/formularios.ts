import { descreverErro, ErroApi } from './api/erros';

import type mensagens from './mensagens/pt-BR.json';

export type ChaveValidacao = keyof (typeof mensagens)['validacao'];

/**
 * Mensagem do catálogo para o erro de um campo. O `type` do react-hook-form é o código do Zod
 * (schemas de @pz/contracts), cujas mensagens padrão são em inglês e não aparecem na tela, ou o
 * nome da regra nativa (`required`, `maxLength`, `validate`).
 */
export function chaveValidacao(tipo: string | undefined): ChaveValidacao {
  switch (tipo) {
    case 'too_small':
    case 'required':
      return 'obrigatorio';
    case 'too_big':
    case 'maxLength':
      return 'muitoLongo';
    case 'confirmacao':
      return 'confirmacaoDiferente';
    default:
      return 'invalido';
  }
}

export type ChaveErroAcesso = keyof (typeof mensagens)['acesso']['erros'];

/**
 * Falha de um formulário de acesso. 401 e 429 têm texto próprio que não revela se a conta existe
 * (HU06); os demais usam a descrição do problem+json.
 */
export function erroDeAcesso(
  erro: unknown,
  credenciaisInvalidas: ChaveErroAcesso,
): { chave: ChaveErroAcesso } | { titulo: string; descricao: string } {
  if (erro instanceof ErroApi && erro.status === 401) return { chave: credenciaisInvalidas };
  if (erro instanceof ErroApi && erro.status === 429) return { chave: 'muitasTentativas' };
  return descreverErro(erro);
}
