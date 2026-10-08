// API pública do módulo captura (CLAUDE.md, seção 6): outros módulos e as apps só usam o que está aqui.
export {
  ConsultarStatusDaCaptura,
  EntradaDaCaptura,
  ExecutarCaptura,
  ManterAssinaturas,
  PlanejarCaptura,
} from './application/captura.js';
export type {
  CapturaPlanejada,
  OpcoesDaCaptura,
  ResultadoDaCaptura,
  StatusDaCaptura,
} from './application/captura.js';
export type {
  AlertasDaCaptura,
  AlvoDevido,
  LeituraDoStatus,
  SituacaoPublicaDaFonte,
  StatusDaOab,
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
export {
  AssinaturasPostgres,
  CapturaPostgres,
  LeituraDoStatusPostgres,
} from './infra/captura-postgres.js';
export {
  FALHAS_PARA_ALERTAR_ALVO,
  FALHAS_PARA_DEGRADAR,
  SITUACOES_DA_FONTE,
} from './domain/fonte.js';
export type { EstadoDaFonte, SituacaoDaFonte } from './domain/fonte.js';
