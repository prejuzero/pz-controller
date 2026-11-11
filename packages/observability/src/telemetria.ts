import { context, diag, DiagLogLevel, metrics, propagation, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from '@opentelemetry/core';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  AggregationType,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor, SimpleSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

import { criarLogger } from './logger.js';

import type { Logger } from './logger.js';
import type { Instrumentation } from '@opentelemetry/instrumentation';
import type { IMetricReader } from '@opentelemetry/sdk-metrics';
import type { SpanExporter, SpanProcessor } from '@opentelemetry/sdk-trace';

export interface OpcoesTelemetria {
  /** Nome do serviço nos traces e métricas: `pz-api`, `pz-worker`, `pz-web`. */
  readonly servico: string;
  /** Versão implantada (SHA do commit). */
  readonly versao: string;
  /** `development`, `staging` ou `production`. */
  readonly ambiente: string;
  /** `OTEL_EXPORTER_OTLP_ENDPOINT`. Sem ele, nada é exportado (traces e métricas só em memória). */
  readonly endpointOtlp?: string;
  /** Instrumentações além das padrão (ex.: BullMQ na HU10). */
  readonly instrumentacoes?: readonly Instrumentation[];
  /** Exportador de spans adicional, síncrono. Usado em testes ou por um backend alternativo. */
  readonly exportadorDeSpans?: SpanExporter;
  /** Leitor de métricas adicional. Usado em testes ou por um backend alternativo. */
  readonly leitorDeMetricas?: IMetricReader;
  readonly intervaloMetricasMs?: number;
  /** Destino das mensagens internas do OpenTelemetry. Padrão: `criarLogger('telemetria')`. */
  readonly loggerDiagnostico?: Logger;
}

export interface Telemetria {
  /** Envia o que estiver pendente e desliga tudo. Chamar no shutdown gracioso. */
  encerrar(): Promise<void>;
}

const INTERVALO_METRICAS_PADRAO_MS = 15_000;

/** Falhas internas do OpenTelemetry (ex.: exportação recusada) viram log, nunca silêncio. */
function encaminharDiagnosticoParaLog(logger: Logger): void {
  diag.setLogger(
    {
      error: (mensagem, ...detalhes) => {
        logger.error({ detalhes }, mensagem);
      },
      warn: (mensagem, ...detalhes) => {
        logger.warn({ detalhes }, mensagem);
      },
      info: (mensagem, ...detalhes) => {
        logger.info({ detalhes }, mensagem);
      },
      debug: (mensagem, ...detalhes) => {
        logger.debug({ detalhes }, mensagem);
      },
      verbose: (mensagem, ...detalhes) => {
        logger.trace({ detalhes }, mensagem);
      },
    },
    { logLevel: DiagLogLevel.WARN, suppressOverrideMessage: true },
  );
}

/**
 * Buckets da latência HTTP (HU40, SLOs da página Padrões de engenharia): 0,3 s e 0,8 s são os
 * limites de p95 da leitura e da escrita; os alertas de burn rate contam as requisições abaixo
 * deles (`le="0.3"` e `le="0.8"`). Mudar estes valores exige mudar os alertas de SLO.
 */
export const LIMITES_LATENCIA_HTTP_SEGUNDOS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.3, 0.5, 0.8, 1, 2.5, 5, 10,
] as const;

/**
 * Liga traces e métricas OpenTelemetry com exportação OTLP (ADR-011). Chamar uma única vez,
 * antes de carregar o restante da app, para que as instrumentações se apliquem aos módulos.
 */
export function iniciarTelemetria(opcoes: OpcoesTelemetria): Telemetria {
  encaminharDiagnosticoParaLog(opcoes.loggerDiagnostico ?? criarLogger('telemetria'));

  const recurso = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: opcoes.servico,
    [ATTR_SERVICE_VERSION]: opcoes.versao,
    // Convenção ainda "incubating" no pacote semantic-conventions; o nome é o oficial.
    'deployment.environment.name': opcoes.ambiente,
  });

  const endpoint = opcoes.endpointOtlp?.replace(/\/+$/, '');
  const processadores: SpanProcessor[] = [];
  if (endpoint !== undefined) {
    processadores.push(
      new BatchSpanProcessor({ exporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }) }),
    );
  }
  if (opcoes.exportadorDeSpans !== undefined) {
    processadores.push(new SimpleSpanProcessor({ exporter: opcoes.exportadorDeSpans }));
  }

  const leitores: IMetricReader[] = [];
  if (endpoint !== undefined) {
    leitores.push(
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
        exportIntervalMillis: opcoes.intervaloMetricasMs ?? INTERVALO_METRICAS_PADRAO_MS,
      }),
    );
  }
  if (opcoes.leitorDeMetricas !== undefined) leitores.push(opcoes.leitorDeMetricas);

  const provedorDeTraces = new TracerProvider({
    resource: recurso,
    spanProcessors: processadores,
  });
  // O SDK 3 não registra nada sozinho (o register() do NodeTracerProvider saiu): contexto por
  // AsyncLocalStorage, propagadores W3C (Trace Context e Baggage, os padrões de antes) e o provedor.
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  propagation.setGlobalPropagator(
    new CompositePropagator({
      propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
    }),
  );
  trace.setGlobalTracerProvider(provedorDeTraces);

  const provedorDeMetricas = new MeterProvider({
    resource: recurso,
    readers: leitores,
    views: [
      {
        instrumentName: 'http.server.request.duration',
        aggregation: {
          type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
          options: { boundaries: [...LIMITES_LATENCIA_HTTP_SEGUNDOS] },
        },
      },
    ],
  });
  metrics.setGlobalMeterProvider(provedorDeMetricas);

  const desregistrarInstrumentacoes = registerInstrumentations({
    tracerProvider: provedorDeTraces,
    meterProvider: provedorDeMetricas,
    instrumentations: [
      // Rotas com credencial no caminho (feed da agenda, HU50): fora dos traces, que guardam a URL.
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (pedido) => credencialNaUrl(pedido.url),
      }),
      new UndiciInstrumentation(),
      new IORedisInstrumentation(),
      // SQL parametrizado nos traces (driver pg do adaptador Prisma); os valores dos parâmetros
      // ficam fora (enhancedDatabaseReporting desligado) para não vazar dados pessoais.
      new PgInstrumentation({ enhancedDatabaseReporting: false }),
      ...(opcoes.instrumentacoes ?? []),
    ],
  });

  return {
    async encerrar() {
      desregistrarInstrumentacoes();
      await Promise.all([provedorDeTraces.shutdown(), provedorDeMetricas.shutdown()]);
      trace.disable();
      metrics.disable();
      propagation.disable();
      context.disable();
      diag.disable();
    },
  };
}

/** Caminhos que levam token na URL (as agendas não mandam cabeçalho): nunca em trace nem log. */
const CAMINHOS_COM_CREDENCIAL = ['/v1/agenda/feed/'];

export function credencialNaUrl(url: string | undefined): boolean {
  return url !== undefined && CAMINHOS_COM_CREDENCIAL.some((c) => url.startsWith(c));
}
