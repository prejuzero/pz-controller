import { context, diag, DiagLogLevel, metrics, propagation, trace } from '@opentelemetry/api';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import {
  BatchSpanProcessor,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

import { criarLogger } from './logger.js';

import type { Logger } from './logger.js';
import type { Instrumentation } from '@opentelemetry/instrumentation';
import type { IMetricReader } from '@opentelemetry/sdk-metrics';
import type { SpanExporter, SpanProcessor } from '@opentelemetry/sdk-trace-node';

export interface OpcoesTelemetria {
  /** Nome do serviço nos traces e métricas: `pz-api`, `pz-worker`, `pz-web`. */
  readonly servico: string;
  /** Versão implantada (SHA do commit). */
  readonly versao: string;
  /** `development`, `staging` ou `production`. */
  readonly ambiente: string;
  /** `OTEL_EXPORTER_OTLP_ENDPOINT`. Sem ele, nada é exportado (traces e métricas só em memória). */
  readonly endpointOtlp?: string;
  /** Instrumentações além das padrão (ex.: Prisma na HU05, BullMQ na HU10). */
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
      new BatchSpanProcessor(new OTLPTraceExporter({ url: `${endpoint}/v1/traces` })),
    );
  }
  if (opcoes.exportadorDeSpans !== undefined) {
    processadores.push(new SimpleSpanProcessor(opcoes.exportadorDeSpans));
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

  const provedorDeTraces = new NodeTracerProvider({
    resource: recurso,
    spanProcessors: processadores,
  });
  // Registra o gerenciador de contexto (AsyncLocalStorage) e o propagador W3C Trace Context.
  provedorDeTraces.register();

  const provedorDeMetricas = new MeterProvider({ resource: recurso, readers: leitores });
  metrics.setGlobalMeterProvider(provedorDeMetricas);

  const desregistrarInstrumentacoes = registerInstrumentations({
    tracerProvider: provedorDeTraces,
    meterProvider: provedorDeMetricas,
    instrumentations: [
      new HttpInstrumentation(),
      new UndiciInstrumentation(),
      new NestInstrumentation(),
      new IORedisInstrumentation(),
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
