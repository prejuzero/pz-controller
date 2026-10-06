export { executarComContexto, obterContexto } from './contexto.js';
export type { ContextoExecucao } from './contexto.js';
export { iniciarCapturaDeErros, registrarErro } from './erros.js';
export { registrarGanchosDeImportacao } from './ganchos.js';
export type { CapturaErros, OpcoesCapturaErros } from './erros.js';
export { criarLogger } from './logger.js';
export type { Logger, OpcoesLogger } from './logger.js';
export {
  ESTADO_CIRCUITO,
  NOMES_METRICAS,
  registrarChamadaIntegracao,
  registrarDivergenciaDeAuditoria,
  registrarEstadoCircuito,
  registrarJobProcessado,
  registrarRejeicaoEmail,
  registrarSituacaoDasFilas,
  registrarWebhookRecusado,
} from './metricas.js';
export type { EstadoCircuito, ResultadoOperacao, SituacaoFila } from './metricas.js';
export {
  capturarContextoPropagavel,
  executarJob,
  executarNoContextoPropagado,
} from './propagacao.js';
export type { ContextoPropagavel, ExecucaoDeJob } from './propagacao.js';
export { registrarRotaHttp } from './rota-http.js';
export { MARCADOR_REMOVIDO, sanitizar, sanitizarTexto } from './sanitizacao.js';
export { iniciarTelemetria } from './telemetria.js';
export type { OpcoesTelemetria, Telemetria } from './telemetria.js';
