import { Catch, HttpException, StandardSchemaValidationPipe } from '@nestjs/common';
import { ErroDominio, Validacao } from '@pz/kernel';
import { criarLogger, obterContexto, registrarErro } from '@pz/observability';

import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Problema } from '@pz/contracts';
import type { CategoriaErro } from '@pz/kernel';
import type { FastifyReply, FastifyRequest } from 'fastify';

const logger = criarLogger('api.http');

const STATUS_POR_CATEGORIA: Readonly<Record<CategoriaErro, number>> = {
  validacao: 400,
  proibido: 403,
  'nao-encontrado': 404,
  conflito: 409,
  'regra-de-negocio': 422,
};

const TITULOS: Readonly<Record<number, string>> = {
  400: 'Dados inválidos.',
  401: 'Autenticação necessária.',
  403: 'Sem permissão.',
  404: 'Não encontrado.',
  405: 'Método não permitido.',
  409: 'Conflito com o estado atual.',
  413: 'Requisição grande demais.',
  415: 'Tipo de conteúdo não suportado.',
  422: 'Regra de negócio violada.',
  429: 'Muitas requisições.',
  500: 'Erro inesperado. A equipe foi avisada.',
};

const CODIGOS_HTTP: Readonly<Record<number, string>> = {
  401: 'autenticacao.necessaria',
  403: 'acesso.negado',
  404: 'rota.nao-encontrada',
  405: 'metodo.nao-permitido',
  413: 'requisicao.grande-demais',
  415: 'conteudo.nao-suportado',
  429: 'limite.excedido',
};

function problema(status: number, codigo: string, detalhes: Partial<Problema> = {}): Problema {
  const { requestId } = obterContexto();
  return {
    type: 'about:blank',
    title: TITULOS[status] ?? 'Erro.',
    status,
    codigo,
    ...(requestId === undefined ? {} : { requestId }),
    ...detalhes,
  };
}

/**
 * Converte qualquer erro em `application/problem+json` (RFC 9457, ADR-009). Erro de domínio
 * vira o status da categoria; erro inesperado vira 500 sem detalhes internos e é registrado
 * (log, métrica, trace e Sentry): nada falha em silêncio.
 */
@Catch()
export class FiltroDeProblemas implements ExceptionFilter {
  catch(erro: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const requisicao = http.getRequest<FastifyRequest>();
    const resposta = http.getResponse<FastifyReply>();
    const corpo = this.paraProblema(erro, requisicao.url);
    void resposta.status(corpo.status).type('application/problem+json').send(corpo);
  }

  private paraProblema(erro: unknown, instancia: string): Problema {
    if (erro instanceof ErroDominio) {
      return problema(STATUS_POR_CATEGORIA[erro.categoria], erro.codigo, {
        detail: erro.message,
        instance: instancia,
        ...(erro instanceof Validacao ? { problemas: [...erro.problemas] } : {}),
      });
    }
    if (erro instanceof HttpException && erro.getStatus() < 500) {
      const status = erro.getStatus();
      return problema(status, CODIGOS_HTTP[status] ?? 'requisicao.invalida', {
        instance: instancia,
      });
    }
    registrarErro(logger, erro, 'erro inesperado na requisição', 'api.http');
    return problema(500, 'erro.inesperado', { instance: instancia });
  }
}

/** Valida parâmetros com os schemas dos contratos; falha vira `Validacao` (400 com problemas). */
export const validacaoPorContrato = new StandardSchemaValidationPipe({
  exceptionFactory: (problemas) =>
    new Validacao(
      problemas.map((item) => ({
        campo:
          item.path
            ?.map((parte) => String(typeof parte === 'object' ? parte.key : parte))
            .join('.') ?? '(raiz)',
        mensagem: item.message,
      })),
    ),
});
