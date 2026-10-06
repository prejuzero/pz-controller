import {
  ErroCredencialInvalida,
  ErroLimiteExcedido,
  ErroPermanente,
  ErroTransitorio,
} from '@pz/integracoes';

import type { ErroIntegracao } from '@pz/integracoes';

const ID = 's3';

/** Códigos do S3 que indicam credencial ausente, errada ou sem permissão. */
const CREDENCIAL = new Set([
  'InvalidAccessKeyId',
  'SignatureDoesNotMatch',
  'AccessDenied',
  'ExpiredToken',
  'InvalidToken',
  'CredentialsProviderError',
]);
const COTA = new Set(['SlowDown', 'Throttling', 'ThrottlingException', 'RequestLimitExceeded']);

interface ErroAws {
  readonly name?: string;
  readonly Code?: string;
  readonly $metadata?: { readonly httpStatusCode?: number };
  readonly $retryable?: unknown;
}

/** Converte o erro do SDK da AWS na classificação padrão (camada anticorrupção). */
export function classificarErroS3(erro: unknown): ErroIntegracao {
  const aws = (typeof erro === 'object' && erro !== null ? erro : {}) as ErroAws;
  const codigo = aws.Code ?? aws.name ?? 'desconhecido';
  const status = aws.$metadata?.httpStatusCode;
  const mensagem = `S3 ${codigo}${status === undefined ? '' : ` (HTTP ${String(status)})`}`;
  const opcoes = { causa: erro };
  if (CREDENCIAL.has(codigo) || status === 401 || status === 403) {
    return new ErroCredencialInvalida(mensagem, ID, opcoes);
  }
  if (COTA.has(codigo) || status === 429 || status === 503) {
    return new ErroLimiteExcedido(mensagem, ID, opcoes);
  }
  // Sem status HTTP: rede, DNS, conexão recusada ou abortada (timeout da resiliência).
  if (status === undefined || status >= 500 || aws.$retryable !== undefined) {
    return new ErroTransitorio(mensagem, ID, opcoes);
  }
  return new ErroPermanente(mensagem, ID, opcoes);
}

export function ehNaoEncontrado(erro: unknown): boolean {
  const aws = (typeof erro === 'object' && erro !== null ? erro : {}) as ErroAws;
  return (
    aws.$metadata?.httpStatusCode === 404 || aws.name === 'NotFound' || aws.name === 'NoSuchKey'
  );
}
