import { describe, expect, it } from 'vitest';

import mensagens from '../mensagens/pt-BR.json';

import {
  CODIGO_RESPOSTA_FORA_DO_CONTRATO,
  descreverErro,
  ehSessaoExpirada,
  ErroApi,
  paraErroApi,
} from './erros';

const problema = {
  type: 'about:blank',
  title: 'Prazo já confirmado',
  status: 409,
  codigo: 'prazo.ja-confirmado',
};

describe('erros da API', () => {
  it('valida o problem+json pelo contrato', () => {
    const erro = paraErroApi(409, { ...problema, detail: 'Confirmado em 01/10.' });
    expect(erro).toBeInstanceOf(ErroApi);
    expect(erro.status).toBe(409);
    expect(descreverErro(erro)).toEqual({
      titulo: 'Prazo já confirmado',
      descricao: 'Confirmado em 01/10.',
      codigo: 'prazo.ja-confirmado',
    });
  });

  it('usa os problemas por campo quando não há detail', () => {
    const erro = paraErroApi(400, {
      ...problema,
      status: 400,
      problemas: [{ campo: 'email', mensagem: 'E-mail inválido.' }],
    });
    expect(descreverErro(erro).descricao).toBe('E-mail inválido.');
    expect(descreverErro(paraErroApi(409, problema)).descricao).toBe(
      mensagens.erros.inesperadoDescricao,
    );
  });

  it('resposta fora do contrato vira erro genérico com o status', () => {
    const erro = paraErroApi(502, '<html>Bad Gateway</html>');
    expect(erro.status).toBe(502);
    expect(erro.problema.codigo).toBe(CODIGO_RESPOSTA_FORA_DO_CONTRATO);
  });

  it('descreve falha de rede e erro desconhecido', () => {
    expect(descreverErro(new TypeError('Failed to fetch')).titulo).toBe(mensagens.erros.semConexao);
    expect(descreverErro(new Error('x')).titulo).toBe(mensagens.erros.inesperado);
  });

  it('401 é sessão expirada', () => {
    expect(ehSessaoExpirada(paraErroApi(401, undefined))).toBe(true);
    expect(ehSessaoExpirada(paraErroApi(403, undefined))).toBe(false);
    expect(ehSessaoExpirada(new Error('x'))).toBe(false);
  });
});
