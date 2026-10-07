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
  PreferenciasDeNotificacao,
  RepositorioDeNotificacoes,
} from './application/portas.js';
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
export { NotificacoesEmMemoria } from './infra/em-memoria.js';
export {
  NotificacoesPostgres,
  PreferenciasPostgres,
  SupressaoPostgres,
} from './infra/notificacoes-postgres.js';
