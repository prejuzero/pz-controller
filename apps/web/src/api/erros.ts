import { Problema } from '@pz/contracts';

import mensagens from '../mensagens/pt-BR.json';

/** Erro da API no formato problem+json (RFC 9457), já validado pelo schema do contrato. */
export class ErroApi extends Error {
  constructor(readonly problema: Problema) {
    super(problema.title);
    this.name = 'ErroApi';
  }

  get status(): number {
    return this.problema.status;
  }
}

/** Código usado quando a resposta de erro não segue o contrato (ex.: proxy ou gateway no meio). */
export const CODIGO_RESPOSTA_FORA_DO_CONTRATO = 'web.resposta-fora-do-contrato';

/** Toda resposta externa passa pelo Zod (CLAUDE.md, seção 3): corpo inválido vira erro genérico. */
export function paraErroApi(status: number, corpo: unknown): ErroApi {
  const resultado = Problema.safeParse(corpo);
  if (resultado.success) return new ErroApi(resultado.data);
  return new ErroApi({
    type: 'about:blank',
    title: mensagens.erros.inesperado,
    status,
    codigo: CODIGO_RESPOSTA_FORA_DO_CONTRATO,
  });
}

export interface DescricaoErro {
  titulo: string;
  descricao: string;
  codigo?: string;
}

/** Texto exibido ao usuário para qualquer falha: nada falha em silêncio (CLAUDE.md, seção 2). */
export function descreverErro(erro: unknown): DescricaoErro {
  if (erro instanceof ErroApi) {
    const { title, detail, codigo, problemas } = erro.problema;
    const porCampo = problemas?.map((p) => p.mensagem).join(' ');
    return {
      titulo: title,
      descricao: detail ?? porCampo ?? mensagens.erros.inesperadoDescricao,
      codigo,
    };
  }
  // fetch rejeita com TypeError quando não há resposta (rede, DNS, servidor fora do ar).
  if (erro instanceof TypeError) {
    return { titulo: mensagens.erros.semConexao, descricao: mensagens.erros.semConexaoDescricao };
  }
  return { titulo: mensagens.erros.inesperado, descricao: mensagens.erros.inesperadoDescricao };
}

export function ehSessaoExpirada(erro: unknown): boolean {
  return erro instanceof ErroApi && erro.status === 401;
}
