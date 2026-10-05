import { register } from 'node:module';

/**
 * Em ESM, as instrumentações automáticas só alcançam módulos carregados depois que os ganchos
 * de importação são registrados. Chame antes de `iniciarTelemetria`, num arquivo carregado com
 * `node --import` antes do `main` da app.
 */
export function registrarGanchosDeImportacao(): void {
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- o gancho do OpenTelemetry (import-in-the-middle) só funciona com register; registerHooks é síncrono e ainda não é suportado por ele
  register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);
}
