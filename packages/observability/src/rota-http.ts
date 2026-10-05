import { context, trace } from '@opentelemetry/api';
import { getRPCMetadata, RPCType } from '@opentelemetry/core';

/**
 * Informa a rota (o padrão, como `/v1/prazos/{id}`, nunca a URL com ids) da requisição HTTP
 * em andamento: vira `http.route` no span e nas métricas de duração por rota, e dá nome ao
 * span. Chamado pelo framework HTTP da app assim que a rota é resolvida.
 */
export function registrarRotaHttp(metodo: string, rota: string): void {
  const metadados = getRPCMetadata(context.active());
  if (metadados?.type === RPCType.HTTP) metadados.route = rota;
  trace.getActiveSpan()?.updateName(`${metodo} ${rota}`);
}
