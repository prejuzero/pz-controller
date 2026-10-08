// API pública do módulo administracao (CLAUDE.md, seção 6): outros módulos e as apps só usam o que está aqui.
export { ReprocessarJobMorto } from './application/reprocessar-job-morto.js';
export type {
  DependenciasDoReprocessamento,
  FilaDeMortos,
  PedidoDeReprocessamento,
} from './application/reprocessar-job-morto.js';
export type { JobMorto } from './domain/job-morto.js';
export { FilaDeMortosBullMq } from './infra/fila-de-mortos-bullmq.js';
export { FilaDeMortosEmMemoria } from './infra/fila-de-mortos-em-memoria.js';
export {
  ConsultarFilas,
  ConsultarIntegracoes,
  LIMITE_DO_HISTORICO,
  PublicarSituacaoDasIntegracoes,
} from './application/painel.js';
export type {
  ArmazemDoPainel,
  ContadorDeFilas,
  PainelDeIntegracoes,
  ResumoDeFila,
} from './application/painel.js';
export { consolidar, VALIDADE_DO_RETRATO_MS } from './domain/integracoes.js';
export type { FalhaDeIntegracao, IntegracaoConsolidada, Retrato } from './domain/integracoes.js';
export { PainelEmMemoria } from './infra/painel-em-memoria.js';
export { PainelRedis } from './infra/painel-redis.js';
