import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { Validacao } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { FiltroDeProblemas, validacaoPorContrato } from './problemas.js';

import type { ArgumentsHost } from '@nestjs/common';

function capturar(erro: unknown) {
  const enviado: { status?: number; tipo?: string; corpo?: unknown } = {};
  const resposta = {
    status(status: number) {
      enviado.status = status;
      return this;
    },
    type(tipo: string) {
      enviado.tipo = tipo;
      return this;
    },
    send(corpo: unknown) {
      enviado.corpo = corpo;
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({ getRequest: () => ({ url: '/v1/x' }), getResponse: () => resposta }),
  } as unknown as ArgumentsHost;
  new FiltroDeProblemas().catch(erro, host);
  return enviado;
}

describe('FiltroDeProblemas', () => {
  it('fora de uma requisição não inventa requestId', () => {
    const { corpo } = capturar(new HttpException('x', 404));
    expect(corpo).not.toHaveProperty('requestId');
  });

  it('status HTTP sem mapeamento usa título e código genéricos', () => {
    const { status, corpo } = capturar(new HttpException('chá', 418));
    expect(status).toBe(418);
    expect(corpo).toMatchObject({ title: 'Erro.', codigo: 'requisicao.invalida' });
  });

  it('exceção HTTP 5xx é tratada como erro inesperado', () => {
    const { status, tipo, corpo } = capturar(new ServiceUnavailableException('detalhe interno'));
    expect(status).toBe(500);
    expect(tipo).toBe('application/problem+json');
    expect(JSON.stringify(corpo)).not.toContain('detalhe interno');
  });
});

describe('validacaoPorContrato', () => {
  it('converte problemas do schema em Validacao por campo', () => {
    const fabrica = (
      validacaoPorContrato as unknown as {
        exceptionFactory: (problemas: readonly { message: string; path?: unknown[] }[]) => unknown;
      }
    ).exceptionFactory;

    const erro = fabrica([
      { message: 'obrigatório' },
      { message: 'muito grande', path: ['itens', { key: 0 }, 'valor'] },
    ]);

    expect(erro).toBeInstanceOf(Validacao);
    expect((erro as Validacao).problemas).toEqual([
      { campo: '(raiz)', mensagem: 'obrigatório' },
      { campo: 'itens.0.valor', mensagem: 'muito grande' },
    ]);
  });
});
