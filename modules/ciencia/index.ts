// API pública do módulo ciencia (CLAUDE.md, seção 6): outros módulos e as apps só usam o que está aqui.
export {
  ConfirmarCiencia,
  ConsultarLinkDeCiencia,
  EmitirLinkDeCiencia,
  RegistrarIndicioDeCiencia,
} from './application/ciencia.js';
export type {
  CienciaConfirmada,
  CienciaDoPrazo,
  ContextoDaRequisicao,
  DadosDoPrazo,
  ItemDoLote,
  NoTenant as NoTenantDaCiencia,
  PrazoParaCiencia,
  RepositorioDeCiencia,
  ResultadoDaConfirmacao,
  ResultadoDoLote,
  SituacaoDoLink,
  TokensDeCiencia,
} from './application/ciencia.js';
export {
  avancar,
  CANAIS_DA_CONFIRMACAO,
  contaComoCiencia,
  ESTADOS_DA_CIENCIA,
  VALIDADE_DO_TOKEN_MS,
} from './domain/estado.js';
export type { CanalDaConfirmacao, EstadoDaCiencia } from './domain/estado.js';
export { CienciaPostgres } from './infra/ciencia-postgres.js';
export { CienciaEmMemoria } from './infra/em-memoria.js';
export { hashDoToken, TokensHmac } from './infra/tokens.js';
