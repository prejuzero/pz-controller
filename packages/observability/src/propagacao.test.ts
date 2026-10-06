import { context, ROOT_CONTEXT, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { MetricReader } from '@opentelemetry/sdk-metrics';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { executarComContexto, obterContexto } from './contexto.js';
import { NOMES_METRICAS } from './metricas.js';
import {
  capturarContextoPropagavel,
  executarJob,
  executarNoContextoPropagado,
} from './propagacao.js';
import { iniciarTelemetria } from './telemetria.js';

import type { Telemetria } from './telemetria.js';
import type { HistogramMetricData } from '@opentelemetry/sdk-metrics';

class LeitorEmMemoria extends MetricReader {
  protected onForceFlush(): Promise<void> {
    return Promise.resolve();
  }
  protected onShutdown(): Promise<void> {
    return Promise.resolve();
  }
}

describe('propagação do contexto até o job', () => {
  let telemetria: Telemetria;
  let exportador: InMemorySpanExporter;
  let leitor: LeitorEmMemoria;

  beforeEach(() => {
    exportador = new InMemorySpanExporter();
    leitor = new LeitorEmMemoria();
    telemetria = iniciarTelemetria({
      servico: 'pz-teste',
      versao: 'abc123',
      ambiente: 'test',
      exportadorDeSpans: exportador,
      leitorDeMetricas: leitor,
    });
  });
  afterEach(async () => {
    await telemetria.encerrar();
  });

  async function duracoesDeJob() {
    const { resourceMetrics } = await leitor.collect();
    const metrica = resourceMetrics.scopeMetrics
      .flatMap((escopo) => escopo.metrics)
      .find((item) => item.descriptor.name === NOMES_METRICAS.jobDuracao) as
      HistogramMetricData | undefined;
    return metrica?.dataPoints.map((ponto) => ({
      atributos: ponto.attributes,
      quantidade: ponto.value.count,
    }));
  }

  it('o job continua o trace da requisição de origem e restaura a correlação', async () => {
    const rastreador = trace.getTracer('teste');
    const contexto = rastreador.startActiveSpan('POST /v1/processos', (span) => {
      const capturado = executarComContexto(
        { requestId: 'req-1', userId: 'u-1', tenantId: 't-1' },
        () => capturarContextoPropagavel(),
      );
      span.end();
      return capturado;
    });

    expect(contexto).toMatchObject({ requestId: 'req-1', userId: 'u-1' });
    expect(contexto).not.toHaveProperty('tenantId');

    // O worker roda em outro processo: nada do contexto ativo da requisição está disponível.
    const visto = await context.with(ROOT_CONTEXT, () =>
      executarJob({ fila: 'captura', jobId: 'job-7', tenantId: 't-1', contexto }, () =>
        Promise.resolve(obterContexto()),
      ),
    );

    expect(visto).toEqual({
      requestId: 'req-1',
      userId: 'u-1',
      tenantId: 't-1',
      jobId: 'job-7',
      fila: 'captura',
    });

    const [origem, consumo] = exportador.getFinishedSpans();
    expect(consumo?.name).toBe('captura process');
    expect(consumo?.kind).toBe(SpanKind.CONSUMER);
    expect(consumo?.spanContext().traceId).toBe(origem?.spanContext().traceId);
    expect(consumo?.parentSpanContext?.spanId).toBe(origem?.spanContext().spanId);
    expect(consumo?.attributes).toMatchObject({
      'messaging.destination.name': 'captura',
      'messaging.message.id': 'job-7',
      'pz.tenant.id': 't-1',
    });

    expect(await duracoesDeJob()).toEqual([
      { atributos: { fila: 'captura', resultado: 'sucesso' }, quantidade: 1 },
    ]);
  });

  it('marca o span com erro, conta a falha e repassa o erro', async () => {
    const falha = new Error('fonte indisponível');

    await expect(
      executarJob({ fila: 'captura', jobId: 'job-8', tenantId: 't-1' }, () =>
        Promise.reject(falha),
      ),
    ).rejects.toBe(falha);
    await expect(
      executarJob({ fila: 'email', jobId: 'job-9', tenantId: 't-1' }, () =>
        Promise.reject(new Error('texto')),
      ),
    ).rejects.toThrow('texto');

    const [span] = exportador.getFinishedSpans();
    expect(span?.status.code).toBe(SpanStatusCode.ERROR);
    expect(span?.events.map((evento) => evento.name)).toContain('exception');
    expect(await duracoesDeJob()).toEqual(
      expect.arrayContaining([
        { atributos: { fila: 'captura', resultado: 'falha' }, quantidade: 1 },
      ]),
    );
  });

  it('sem contexto propagado, o job inicia um trace novo', async () => {
    expect(capturarContextoPropagavel()).toEqual({});

    await executarJob({ fila: 'agendador', jobId: 'job-1', tenantId: 't-1', contexto: {} }, () =>
      Promise.resolve(),
    );

    const [span] = exportador.getFinishedSpans();
    expect(span?.parentSpanContext).toBeUndefined();
  });

  it('executarNoContextoPropagado retoma o trace e a correlação para o que for publicado dali', () => {
    const contexto = trace.getTracer('teste').startActiveSpan('origem', (span) => {
      const capturado = executarComContexto({ requestId: 'req-9', userId: 'u-9' }, () =>
        capturarContextoPropagavel(),
      );
      span.end();
      return capturado;
    });

    const retomado = context.with(ROOT_CONTEXT, () =>
      executarNoContextoPropagado(contexto, () => capturarContextoPropagavel()),
    );

    expect(retomado).toEqual(contexto);
    expect(executarNoContextoPropagado({}, () => obterContexto())).toEqual({});
  });
});
