import { trace } from '@opentelemetry/api';
import { pino } from 'pino';

import { obterContexto } from './contexto.js';
import { sanitizar, sanitizarTexto } from './sanitizacao.js';

import type { DestinationStream, Level, Logger } from 'pino';

export type { Logger } from 'pino';

export interface OpcoesLogger {
  /** Padrão: `LOG_LEVEL` do ambiente (validado pelo `@pz/config/env`) ou `info`. */
  readonly nivel?: Level;
  /** Padrão: saída padrão, síncrona. Testes passam um stream em memória. */
  readonly destino?: DestinationStream;
}

const NIVEIS: readonly string[] = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];

function nivelDoAmbiente(): Level {
  const nivel = process.env.LOG_LEVEL;
  return nivel !== undefined && NIVEIS.includes(nivel) ? (nivel as Level) : 'info';
}

/** Correlação em todo log: identificadores da execução e do trace ativo (ADR-011). */
function correlacao(): Record<string, string> {
  const campos: Record<string, string> = { ...obterContexto() };
  const span = trace.getActiveSpan()?.spanContext();
  if (span !== undefined && trace.isSpanContextValid(span)) {
    campos.trace_id = span.traceId;
    campos.span_id = span.spanId;
  }
  return campos;
}

/**
 * Logger JSON padrão do PrejuZero: `criarLogger('prazos')`.
 * Todo objeto e toda mensagem passam pela redação de dados sensíveis antes de sair.
 */
export function criarLogger(modulo: string, opcoes: OpcoesLogger = {}): Logger {
  const configuracao = {
    level: opcoes.nivel ?? nivelDoAmbiente(),
    base: { modulo },
    messageKey: 'msg',
    timestamp: pino.stdTimeFunctions.isoTime,
    mixin: correlacao,
    // O erro já sai como objeto sanitizado de `formatters.log`; o serializador padrão do pino
    // o reprocessaria e trocaria o tipo original por "Object".
    serializers: { err: (erro: unknown) => erro },
    formatters: {
      level: (rotulo: string) => ({ level: rotulo }),
      log: (objeto: Record<string, unknown>) => sanitizar(objeto) as Record<string, unknown>,
    },
    hooks: {
      // Mensagens e argumentos de interpolação também podem carregar dados pessoais.
      logMethod(this: Logger, argumentos: unknown[], metodo: (...args: unknown[]) => void) {
        const [primeiro, ...demais] = argumentos;
        // `logger.error(erro)` faria o pino usar erro.message como mensagem sem passar pela redação.
        const inicio =
          primeiro instanceof Error
            ? [{ err: primeiro }, ...(typeof demais[0] === 'string' ? [] : [primeiro.message])]
            : [primeiro];
        metodo.apply(
          this,
          [...inicio, ...demais].map((argumento) =>
            typeof argumento === 'string' ? sanitizarTexto(argumento) : argumento,
          ),
        );
      },
    },
  };
  // Stdout síncrono: num container o processo pode ser encerrado logo após o último log
  // (ex.: desligamento por SIGTERM), e um buffer assíncrono perderia justamente essas linhas.
  return pino(configuracao, opcoes.destino ?? pino.destination({ dest: 1, sync: true }));
}
