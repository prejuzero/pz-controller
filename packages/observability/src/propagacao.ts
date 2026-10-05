import {
  context,
  propagation,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';

import { executarComContexto, obterContexto } from './contexto.js';
import { registrarJobProcessado } from './metricas.js';

/**
 * Contexto que atravessa a fronteira assíncrona (outbox → relay → fila → worker) dentro do
 * payload, para que a requisição de origem e o processamento apareçam como um único trace.
 * O tenantId não viaja aqui: ele é campo obrigatório do próprio job (HU10).
 */
export interface ContextoPropagavel {
  readonly traceparent?: string;
  readonly tracestate?: string;
  readonly requestId?: string;
  readonly userId?: string;
}

/** Captura o contexto atual para gravar junto do evento ou do job. */
export function capturarContextoPropagavel(): ContextoPropagavel {
  const portador: Record<string, string> = {};
  propagation.inject(context.active(), portador);
  const { requestId, userId } = obterContexto();
  return {
    ...(portador.traceparent === undefined ? {} : { traceparent: portador.traceparent }),
    ...(portador.tracestate === undefined ? {} : { tracestate: portador.tracestate }),
    ...(requestId === undefined ? {} : { requestId }),
    ...(userId === undefined ? {} : { userId }),
  };
}

export interface ExecucaoDeJob {
  readonly fila: string;
  readonly jobId: string;
  readonly tenantId: string;
  readonly contexto?: ContextoPropagavel;
}

const NOME_RASTREADOR = '@pz/observability';

/**
 * Processa um job dentro do trace de origem: abre o span de consumo, restaura os
 * identificadores de correlação para os logs e mede duração e resultado por fila.
 */
export async function executarJob<Resultado>(
  job: ExecucaoDeJob,
  processar: () => Promise<Resultado>,
): Promise<Resultado> {
  const { traceparent, tracestate, requestId, userId } = job.contexto ?? {};
  const portador = {
    ...(traceparent === undefined ? {} : { traceparent }),
    ...(tracestate === undefined ? {} : { tracestate }),
  };
  const origem = propagation.extract(ROOT_CONTEXT, portador);
  const rastreador = trace.getTracer(NOME_RASTREADOR);

  return context.with(origem, () =>
    rastreador.startActiveSpan(
      `${job.fila} process`,
      {
        kind: SpanKind.CONSUMER,
        attributes: {
          'messaging.system': 'bullmq',
          'messaging.operation.type': 'process',
          'messaging.destination.name': job.fila,
          'messaging.message.id': job.jobId,
          'pz.tenant.id': job.tenantId,
        },
      },
      (span) =>
        executarComContexto(
          {
            tenantId: job.tenantId,
            jobId: job.jobId,
            fila: job.fila,
            ...(requestId === undefined ? {} : { requestId }),
            ...(userId === undefined ? {} : { userId }),
          },
          async () => {
            const inicio = performance.now();
            const duracao = () => (performance.now() - inicio) / 1000;
            try {
              const resultado = await processar();
              registrarJobProcessado(job.fila, 'sucesso', duracao());
              return resultado;
            } catch (erro) {
              span.recordException(erro instanceof Error ? erro : String(erro));
              span.setStatus({ code: SpanStatusCode.ERROR });
              registrarJobProcessado(job.fila, 'falha', duracao());
              throw erro;
            } finally {
              span.end();
            }
          },
        ),
    ),
  );
}
