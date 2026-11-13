// API pública do módulo captura (CLAUDE.md, seção 6): outros módulos e as apps só usam o que está aqui.
export {
  ConsultarStatusDaCaptura,
  EntradaDaCaptura,
  ExecutarCaptura,
  ManterAssinaturas,
  PlanejarBuscaAgora,
  PlanejarCaptura,
  PUBLICACOES_POR_EVENTO,
  RegistrarProximaRodada,
  SolicitarBuscaAgora,
} from './application/captura.js';
export type {
  AutorDaBusca,
  CapturaPlanejada,
  OpcoesDaCaptura,
  ResultadoDaCaptura,
  StatusDaCaptura,
  StatusDaOabNoEscritorio,
} from './application/captura.js';
export type {
  AlertasDaCaptura,
  AlvoDaBusca,
  AlvoDevido,
  LeituraDoStatus,
  SituacaoPublicaDaFonte,
  StatusDaOab,
  AlvoParaEntrega,
  RepositorioDaBuscaAgora,
  RepositorioDaCaptura,
  RepositorioDeAssinaturas,
} from './application/portas.js';
export {
  buscaAgoraLiberadaEm,
  chaveDaCaptura,
  INTERVALO_DA_BUSCA_AGORA_MS,
  janelaDaCaptura,
  TIPOS_DE_ALVO,
  valorDaOab,
  valorDoProcesso,
} from './domain/alvo.js';
export type { JanelaDaCaptura, TipoDeAlvo } from './domain/alvo.js';
export { CapturaEmMemoria } from './infra/em-memoria.js';
export {
  AssinaturasPostgres,
  BuscaAgoraPostgres,
  CapturaPostgres,
  LeituraDoStatusPostgres,
} from './infra/captura-postgres.js';
export {
  FALHAS_PARA_ALERTAR_ALVO,
  FALHAS_PARA_DEGRADAR,
  SITUACOES_DA_FONTE,
} from './domain/fonte.js';
export type { EstadoDaFonte, SituacaoDaFonte } from './domain/fonte.js';
