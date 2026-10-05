import { SpanStatusCode, trace } from '@opentelemetry/api';
import * as Sentry from '@sentry/node';

import { obterContexto } from './contexto.js';
import { registrarErroInesperado } from './metricas.js';
import { sanitizar } from './sanitizacao.js';

import type { Logger } from './logger.js';
import type { ErrorEvent, NodeOptions } from '@sentry/node';

export interface OpcoesCapturaErros {
  /** `SENTRY_DSN`. Sem ele a captura fica desligada e nada sai da máquina. */
  readonly dsn?: string;
  readonly ambiente: string;
  /** Versão implantada (SHA do commit). */
  readonly release: string;
  /** Exceções não tratadas e promessas rejeitadas do processo. Padrão: true. */
  readonly capturarFalhasDoProcesso?: boolean;
  /** Transporte alternativo (testes). */
  readonly transporte?: NodeOptions['transport'];
}

export interface CapturaErros {
  readonly ativa: boolean;
  encerrar(): Promise<void>;
}

const ESPERA_ENVIO_MS = 2_000;

/** Último filtro antes de o evento sair: mesma redação dos logs. */
function sanitizarEvento(evento: ErrorEvent): ErrorEvent {
  return sanitizar(evento) as ErrorEvent;
}

/**
 * Liga o Sentry (ADR-011) com release e ambiente. Só as integrações de erro: traces ficam no
 * OpenTelemetry, então o Sentry não instrumenta nada nem registra provedor de traces.
 */
export function iniciarCapturaDeErros(opcoes: OpcoesCapturaErros): CapturaErros {
  if (opcoes.dsn === undefined || opcoes.dsn === '') {
    return { ativa: false, encerrar: () => Promise.resolve() };
  }
  Sentry.init({
    dsn: opcoes.dsn,
    environment: opcoes.ambiente,
    release: opcoes.release,
    // O padrão coleta usuário, cookies, cabeçalhos e corpos HTTP: nada disso sai (sigilo e LGPD).
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    defaultIntegrations: false,
    integrations: [
      Sentry.dedupeIntegration(),
      Sentry.functionToStringIntegration(),
      Sentry.linkedErrorsIntegration(),
      ...(opcoes.capturarFalhasDoProcesso === false
        ? []
        : [Sentry.onUncaughtExceptionIntegration(), Sentry.onUnhandledRejectionIntegration()]),
    ],
    beforeSend: sanitizarEvento,
    ...(opcoes.transporte === undefined ? {} : { transport: opcoes.transporte }),
  });
  return {
    ativa: true,
    async encerrar() {
      await Sentry.close(ESPERA_ENVIO_MS);
    },
  };
}

/**
 * Ponto único para erro inesperado ("nada falha em silêncio", CLAUDE.md, seção 2):
 * registra em log, conta na métrica `pz.erros`, marca o span ativo e envia ao Sentry
 * com os identificadores de correlação.
 */
export function registrarErro(
  logger: Logger,
  erro: unknown,
  mensagem: string,
  origem: string,
): void {
  logger.error({ err: erro, origem }, mensagem);
  registrarErroInesperado(origem);

  const span = trace.getActiveSpan();
  span?.recordException(erro instanceof Error ? erro : String(erro));
  span?.setStatus({ code: SpanStatusCode.ERROR, message: mensagem });

  Sentry.withScope((escopo) => {
    escopo.setTag('origem', origem);
    for (const [chave, valor] of Object.entries(obterContexto())) {
      if (typeof valor === 'string') escopo.setTag(chave, valor);
    }
    const contextoDoSpan = span?.spanContext();
    if (contextoDoSpan !== undefined && trace.isSpanContextValid(contextoDoSpan)) {
      escopo.setTag('trace_id', contextoDoSpan.traceId);
    }
    Sentry.captureException(erro);
  });
}
