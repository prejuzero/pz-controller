import { context, ROOT_CONTEXT, trace } from '@opentelemetry/api';
import { RPCType, setRPCMetadata } from '@opentelemetry/core';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-node';
import { afterEach, describe, expect, it } from 'vitest';

import { registrarRotaHttp } from './rota-http.js';
import { iniciarTelemetria } from './telemetria.js';

import type { Telemetria } from './telemetria.js';
import type { RPCMetadata } from '@opentelemetry/core';

describe('registrarRotaHttp', () => {
  let telemetria: Telemetria | undefined;
  afterEach(async () => {
    await telemetria?.encerrar();
  });

  it('grava a rota nos metadados HTTP e renomeia o span ativo', () => {
    const exportador = new InMemorySpanExporter();
    telemetria = iniciarTelemetria({
      servico: 's',
      versao: 'v',
      ambiente: 'test',
      exportadorDeSpans: exportador,
    });
    const span = trace.getTracer('teste').startSpan('GET');
    const metadados: RPCMetadata = { type: RPCType.HTTP, span };

    context.with(setRPCMetadata(trace.setSpan(ROOT_CONTEXT, span), metadados), () => {
      registrarRotaHttp('GET', '/v1/prazos/:id');
    });
    span.end();

    expect(metadados.route).toBe('/v1/prazos/:id');
    expect(exportador.getFinishedSpans()[0]?.name).toBe('GET /v1/prazos/:id');
  });

  it('fora de uma requisição HTTP não faz nada', () => {
    expect(() => {
      registrarRotaHttp('GET', '/v1/x');
    }).not.toThrow();
  });
});
