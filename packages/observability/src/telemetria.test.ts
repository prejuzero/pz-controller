import { createServer } from 'node:http';
import { Writable } from 'node:stream';

import { diag, trace } from '@opentelemetry/api';
import { MetricReader } from '@opentelemetry/sdk-metrics';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-node';
import { afterEach, describe, expect, it } from 'vitest';

import { criarLogger } from './logger.js';
import { registrarErroInesperado } from './metricas.js';
import { iniciarTelemetria } from './telemetria.js';

import type { Telemetria } from './telemetria.js';
import type { AddressInfo } from 'node:net';

class LeitorEmMemoria extends MetricReader {
  protected onForceFlush(): Promise<void> {
    return Promise.resolve();
  }
  protected onShutdown(): Promise<void> {
    return Promise.resolve();
  }
}

const OPCOES = { servico: 'pz-teste', versao: 'abc123', ambiente: 'test' } as const;

describe('iniciarTelemetria', () => {
  let telemetria: Telemetria | undefined;
  afterEach(async () => {
    await telemetria?.encerrar();
    telemetria = undefined;
  });

  it('exporta spans com serviço, versão e ambiente e desliga tudo ao encerrar', async () => {
    const exportador = new InMemorySpanExporter();
    telemetria = iniciarTelemetria({ ...OPCOES, exportadorDeSpans: exportador });

    trace.getTracer('teste').startActiveSpan('operacao', (span) => {
      span.end();
    });

    const [span] = exportador.getFinishedSpans();
    expect(span?.name).toBe('operacao');
    expect(span?.resource.attributes).toMatchObject({
      'service.name': 'pz-teste',
      'service.version': 'abc123',
      'deployment.environment.name': 'test',
    });

    await telemetria.encerrar();
    telemetria = undefined;
    const depois = trace.getTracer('teste').startSpan('ignorado');
    expect(trace.isSpanContextValid(depois.spanContext())).toBe(false);
  });

  it('expõe as métricas do catálogo ao leitor registrado', async () => {
    const leitor = new LeitorEmMemoria();
    telemetria = iniciarTelemetria({ ...OPCOES, leitorDeMetricas: leitor });

    registrarErroInesperado('teste');

    const { resourceMetrics } = await leitor.collect();
    const nomes = resourceMetrics.scopeMetrics.flatMap((escopo) =>
      escopo.metrics.map((metrica) => metrica.descriptor.name),
    );
    expect(nomes).toContain('pz.erros');
  });

  it('envia traces e métricas por OTLP/HTTP ao endpoint configurado', async () => {
    const caminhos: string[] = [];
    const servidor = createServer((requisicao, resposta) => {
      caminhos.push(requisicao.url ?? '');
      requisicao.resume();
      requisicao.on('end', () => resposta.writeHead(200).end());
    });
    await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver));
    const { port } = servidor.address() as AddressInfo;

    try {
      telemetria = iniciarTelemetria({
        ...OPCOES,
        endpointOtlp: `http://127.0.0.1:${String(port)}/`,
      });
      trace.getTracer('teste').startSpan('exportado').end();
      registrarErroInesperado('teste');
      await telemetria.encerrar();
      telemetria = undefined;
    } finally {
      await new Promise((resolver) => servidor.close(resolver));
    }

    expect(caminhos).toEqual(expect.arrayContaining(['/v1/traces', '/v1/metrics']));
  });

  it('encaminha os diagnósticos do OpenTelemetry para o log', () => {
    const linhas: string[] = [];
    const destino = new Writable({
      write(pedaco: Buffer, _codificacao, concluir) {
        linhas.push(pedaco.toString());
        concluir();
      },
    });
    const loggerDiagnostico = criarLogger('telemetria', { destino, nivel: 'trace' });
    telemetria = iniciarTelemetria({ ...OPCOES, loggerDiagnostico });

    diag.error('exportação recusada', { status: 503 });
    diag.warn('fila cheia');
    diag.info('descartado pelo nível WARN');

    const registros = linhas.map((linha) => JSON.parse(linha) as Record<string, unknown>);
    expect(registros).toEqual([
      expect.objectContaining({
        level: 'error',
        msg: 'exportação recusada',
        detalhes: [{ status: 503 }],
      }),
      expect.objectContaining({ level: 'warn', msg: 'fila cheia' }),
    ]);
  });
});
