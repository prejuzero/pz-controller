// API pública do módulo captura (CLAUDE.md, seção 6): outros módulos e as apps só usam o que está aqui.
export {
  EntradaDaCaptura,
  ExecutarCaptura,
  ManterAssinaturas,
  PlanejarCaptura,
} from './application/captura.js';
export type {
  CapturaPlanejada,
  OpcoesDaCaptura,
  ResultadoDaCaptura,
} from './application/captura.js';
export type {
  AlvoDevido,
  AlvoParaEntrega,
  RepositorioDaCaptura,
  RepositorioDeAssinaturas,
} from './application/portas.js';
export {
  chaveDaCaptura,
  janelaDaCaptura,
  TIPOS_DE_ALVO,
  valorDaOab,
  valorDoProcesso,
} from './domain/alvo.js';
export type { JanelaDaCaptura, TipoDeAlvo } from './domain/alvo.js';
export { CapturaEmMemoria } from './infra/em-memoria.js';
export { AssinaturasPostgres, CapturaPostgres } from './infra/captura-postgres.js';
