// API pública do módulo notificacoes (CLAUDE.md, seção 6): outros módulos e as apps só usam o que está aqui.
export {
  ConsultarAvisosDeEntrega,
  EnviarNotificacao,
  JANELA_DO_AVISO_A_EQUIPE_MS,
  Notificar,
  PedidoDeNotificacao,
  RegistrarDesfechosDeEntrega,
} from './application/notificacoes.js';
export type {
  AvisosDeEntrega,
  ResultadoDoPedido,
  ResumoDosDesfechos,
} from './application/notificacoes.js';
export type {
  DestinosDoUsuario,
  EnviadorDeCanal,
  ListaDeSupressao,
  DestinoPushNovo,
  PreferenciasDeNotificacao,
  RepositorioDeConsentimentos,
  RepositorioDeDestinosPush,
  RepositorioDeNotificacoes,
} from './application/portas.js';
export {
  CANAIS_COM_CONSENTIMENTO,
  exigeConsentimento,
  ORIGENS_DO_CONSENTIMENTO,
} from './domain/consentimento.js';
export type {
  CanalComConsentimento,
  ConsentimentoCanalAlterado,
  OrigemDoConsentimento,
} from './domain/consentimento.js';
export {
  ConcederConsentimento,
  DesativarDestinoPush,
  ListarConsentimentos,
  PedidoDeConsentimento,
  PedidoDeDestinoPush,
  RegistrarDestinoPush,
  RevogarConsentimento,
} from './application/consentimentos.js';
export type { AutorDoConsentimento, ConsentimentoListado } from './application/consentimentos.js';
export { renderizar, TEMPLATES } from './application/templates.js';
export type { MensagemRenderizada } from './application/templates.js';
export { CANAIS, chaveDeIdempotencia, TIPOS_DE_NOTIFICACAO } from './domain/notificacao.js';
export type {
  Canal,
  MotivoDeRejeicao,
  NotificacaoEntregue,
  NotificacaoRejeitada,
  NotificacaoSolicitada,
  TipoDeNotificacao,
} from './domain/notificacao.js';
export { ConsentimentosEmMemoria, NotificacoesEmMemoria } from './infra/em-memoria.js';
export { ConsentimentosPostgres, DestinosPushPostgres } from './infra/consentimentos-postgres.js';
export {
  NotificacoesPostgres,
  PreferenciasPostgres,
  SupressaoPostgres,
} from './infra/notificacoes-postgres.js';
export { ExportacaoDasNotificacoesPostgres } from './infra/exportacao-postgres.js';
