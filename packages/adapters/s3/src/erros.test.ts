import {
  ErroCredencialInvalida,
  ErroLimiteExcedido,
  ErroPermanente,
  ErroTransitorio,
} from '@pz/integracoes';
import { describe, expect, it } from 'vitest';

import { classificarErroS3, ehNaoEncontrado } from './erros.js';

const aws = (name: string, status?: number, extra: object = {}) => ({
  name,
  ...(status === undefined ? {} : { $metadata: { httpStatusCode: status } }),
  ...extra,
});

describe('classificação dos erros do S3', () => {
  it.each([
    [aws('InvalidAccessKeyId', 403), ErroCredencialInvalida],
    [aws('SignatureDoesNotMatch', 403), ErroCredencialInvalida],
    [aws('Forbidden', 401), ErroCredencialInvalida],
    [aws('CredentialsProviderError'), ErroCredencialInvalida],
    [aws('SlowDown', 503), ErroLimiteExcedido],
    [aws('TooManyRequests', 429), ErroLimiteExcedido],
    [aws('InternalError', 500), ErroTransitorio],
    [aws('TimeoutError'), ErroTransitorio],
    [new Error('connect ECONNREFUSED'), ErroTransitorio],
    [aws('RequestTimeout', 400, { $retryable: {} }), ErroTransitorio],
    [aws('InvalidArgument', 400), ErroPermanente],
    [aws('NoSuchBucket', 404), ErroPermanente],
    ['texto', ErroTransitorio],
  ])('%o → %o', (erro, classe) => {
    const classificado = classificarErroS3(erro);
    expect(classificado).toBeInstanceOf(classe);
    expect(classificado.adaptador).toBe('s3');
    expect(classificado.cause).toBe(erro);
  });

  it('usa o código do S3 e o status na mensagem, sem dados do pedido', () => {
    expect(
      classificarErroS3({ Code: 'AccessDenied', $metadata: { httpStatusCode: 403 } }).message,
    ).toBe('S3 AccessDenied (HTTP 403)');
  });

  it('reconhece "não encontrado"', () => {
    expect(ehNaoEncontrado(aws('NotFound', 404))).toBe(true);
    expect(ehNaoEncontrado(aws('NoSuchKey'))).toBe(true);
    expect(ehNaoEncontrado(aws('InternalError', 500))).toBe(false);
    expect(ehNaoEncontrado(null)).toBe(false);
  });
});
