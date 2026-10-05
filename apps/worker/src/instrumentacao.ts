// Carregado com `node --import` antes do main: liga traces, métricas e captura de erros antes
// de qualquer módulo do worker ser importado.
import { carregarAmbiente } from '@pz/config/env';
import {
  iniciarCapturaDeErros,
  iniciarTelemetria,
  registrarGanchosDeImportacao,
} from '@pz/observability';

import { esquemaWorker } from './ambiente.js';

const ambiente = carregarAmbiente(esquemaWorker);

registrarGanchosDeImportacao();
const telemetria = iniciarTelemetria({
  servico: 'pz-worker',
  versao: ambiente.VERSAO,
  ambiente: ambiente.NODE_ENV,
  ...(ambiente.OTEL_EXPORTER_OTLP_ENDPOINT === undefined
    ? {}
    : { endpointOtlp: ambiente.OTEL_EXPORTER_OTLP_ENDPOINT }),
});
const captura = iniciarCapturaDeErros({
  ...(ambiente.SENTRY_DSN === undefined ? {} : { dsn: ambiente.SENTRY_DSN }),
  ambiente: ambiente.NODE_ENV,
  release: ambiente.VERSAO,
});

/** Envia o que estiver pendente. Chamado no desligamento gracioso. */
export async function encerrarObservabilidade(): Promise<void> {
  await Promise.all([telemetria.encerrar(), captura.encerrar()]);
}
