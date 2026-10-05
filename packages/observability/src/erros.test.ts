import { Writable } from 'node:stream';

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-node';
import { afterEach, describe, expect, it } from 'vitest';

import { executarComContexto } from './contexto.js';
import { iniciarCapturaDeErros, registrarErro } from './erros.js';
import { criarLogger } from './logger.js';
import { MARCADOR_REMOVIDO } from './sanitizacao.js';
import { iniciarTelemetria } from './telemetria.js';

import type { CapturaErros } from './erros.js';
import type { Telemetria } from './telemetria.js';
import type { ErrorEvent, NodeOptions } from '@sentry/node';

type Transporte = ReturnType<NonNullable<NodeOptions['transport']>>;
type Envelope = Parameters<Transporte['send']>[0];

// DSN fictício: o transporte de teste intercepta tudo e nada sai da máquina.
const DSN_FICTICIO = 'https://chavepublica@exemplo.invalid/1';
const CPF = '123.456.789-09';

function loggerEmMemoria() {
  const linhas: string[] = [];
  const destino = new Writable({
    write(pedaco: Buffer, _codificacao, concluir) {
      linhas.push(pedaco.toString());
      concluir();
    },
  });
  return { logger: criarLogger('teste', { destino }), linhas };
}

function eventosDe(envelopes: Envelope[]): ErrorEvent[] {
  return envelopes.flatMap(([, itens]) =>
    itens
      .filter(([cabecalho]) => cabecalho.type === 'event')
      .map(([, corpo]) => corpo as ErrorEvent),
  );
}

describe('captura de erros', () => {
  let captura: CapturaErros | undefined;
  let telemetria: Telemetria | undefined;
  afterEach(async () => {
    await captura?.encerrar();
    await telemetria?.encerrar();
    captura = undefined;
    telemetria = undefined;
  });

  it('sem DSN fica desligada, mas o erro ainda vai para o log', async () => {
    captura = iniciarCapturaDeErros({ ambiente: 'test', release: 'abc123' });
    expect(captura.ativa).toBe(false);
    expect(iniciarCapturaDeErros({ dsn: '', ambiente: 'test', release: 'abc123' }).ativa).toBe(
      false,
    );

    const { logger, linhas } = loggerEmMemoria();
    registrarErro(logger, new Error('fonte fora do ar'), 'falha na captura', 'captura');

    expect(JSON.parse(linhas[0] ?? '{}')).toMatchObject({
      level: 'error',
      msg: 'falha na captura',
      origem: 'captura',
      err: { message: 'fonte fora do ar' },
    });
    await expect(captura.encerrar()).resolves.toBeUndefined();
  });

  it('envia o erro com tenantId, requestId, trace e release, sem dados pessoais', async () => {
    const envelopes: Envelope[] = [];
    captura = iniciarCapturaDeErros({
      dsn: DSN_FICTICIO,
      ambiente: 'test',
      release: 'abc123',
      capturarFalhasDoProcesso: false,
      transporte: () => ({
        send: (envelope) => {
          envelopes.push(envelope);
          return Promise.resolve({});
        },
        flush: () => Promise.resolve(true),
      }),
    });
    expect(captura.ativa).toBe(true);
    const exportador = new InMemorySpanExporter();
    telemetria = iniciarTelemetria({
      servico: 'pz-teste',
      versao: 'abc123',
      ambiente: 'test',
      exportadorDeSpans: exportador,
    });
    const { logger } = loggerEmMemoria();

    executarComContexto({ requestId: 'req-1', tenantId: 't-1' }, () => {
      trace.getTracer('teste').startActiveSpan('POST /v1/processos', (span) => {
        registrarErro(logger, new Error(`CPF ${CPF} inválido`), 'falha ao cadastrar', 'cadastro');
        span.end();
      });
    });
    await captura.encerrar();
    captura = undefined;

    const [evento] = eventosDe(envelopes);
    const [span] = exportador.getFinishedSpans();
    expect(evento?.release).toBe('abc123');
    expect(evento?.environment).toBe('test');
    expect(evento?.tags).toMatchObject({
      origem: 'cadastro',
      requestId: 'req-1',
      tenantId: 't-1',
      trace_id: span?.spanContext().traceId,
    });
    expect(evento?.exception?.values?.[0]?.value).toBe(`CPF ${MARCADOR_REMOVIDO} inválido`);
    expect(JSON.stringify(envelopes)).not.toContain(CPF);
    expect(span?.status).toEqual({ code: SpanStatusCode.ERROR, message: 'falha ao cadastrar' });
  });

  it('aceita erro que não é instância de Error', () => {
    const { logger, linhas } = loggerEmMemoria();
    registrarErro(logger, 'texto solto', 'falha estranha', 'teste');
    expect(linhas).toHaveLength(1);
  });
});
