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
