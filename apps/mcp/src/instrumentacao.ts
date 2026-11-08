// Carregado com `node --import` antes do main: liga traces e captura de erros antes de qualquer
// módulo do servidor MCP ser importado (como na api e no worker).
import { carregarAmbiente } from '@pz/config/env';
import {
  iniciarCapturaDeErros,
  iniciarTelemetria,
  registrarGanchosDeImportacao,
} from '@pz/observability';

import { esquemaMcp } from './ambiente.js';

const ambiente = carregarAmbiente(esquemaMcp);

registrarGanchosDeImportacao();
iniciarTelemetria({
  servico: 'pz-mcp',
  versao: ambiente.VERSAO,
  ambiente: ambiente.NODE_ENV,
  ...(ambiente.OTEL_EXPORTER_OTLP_ENDPOINT === undefined
    ? {}
    : { endpointOtlp: ambiente.OTEL_EXPORTER_OTLP_ENDPOINT }),
});
iniciarCapturaDeErros({
  ...(ambiente.SENTRY_DSN === undefined ? {} : { dsn: ambiente.SENTRY_DSN }),
  ambiente: ambiente.NODE_ENV,
  release: ambiente.VERSAO,
});
