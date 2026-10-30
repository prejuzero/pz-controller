// API pública do módulo notificacoes (CLAUDE.md, seção 6): outros módulos e as apps só usam o que está aqui.
export {
  ConsultarAvisosDeEntrega,
  EnviarNotificacao,
  JANELA_DO_AVISO_A_EQUIPE_MS,
  Notificar,
  PedidoDeNotificacao,
  RegistrarDesfechosDeEntrega,
} from './application/notificacoes.js';
export { AvisarSituacaoDaFonte } from './application/avisos-da-fonte.js';
export type { SituacaoDaFonte } from './application/avisos-da-fonte.js';
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
  ResponsaveisDoEscritorio,
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
export { ListarSupressoes } from './application/supressoes.js';
export type {
  ConsultaDeSupressoes,
  PaginaDeSupressoes,
  Supressao,
} from './application/supressoes.js';
export { SupressoesEmMemoria } from './infra/em-memoria.js';
export {
  AvisarNovaIntimacao,
  CancelarLembretes,
  DispararLembretes,
  ProgramarLembretes,
} from './application/lembretes.js';
export type {
  AgendaDoPrazo,
  DesfechoDoLembrete,
  LembreteAgendado,
  NoTenant as NoTenantDosLembretes,
  NumeroDoProcesso,
  PrazoParaLembrete,
  RepositorioDeLembretes,
} from './application/lembretes.js';
export {
  AlterarPreferencias,
  ConsultarPreferencias,
  PedidoDePreferencias,
  PREFERENCIAS_PADRAO,
  TIPOS_CONFIGURAVEIS,
} from './application/preferencias.js';
export type {
  AutorDasPreferencias,
  PreferenciasAlteradas,
  PreferenciasDoUsuario,
  RepositorioDePreferencias,
} from './application/preferencias.js';
export { EnviarResumosDiarios } from './application/resumo.js';
export type { ConteudoDoResumo, FontesDoResumo, ItemDoResumo } from './application/resumo.js';
export { ANTECEDENCIAS_PADRAO, planejarLembretes } from './domain/lembrete.js';
export { HORARIO_PADRAO_DO_RESUMO, resumoDevido } from './domain/resumo.js';
export { LembretesEmMemoria, PreferenciasEmMemoria } from './infra/em-memoria.js';
export { LembretesPostgres } from './infra/lembretes-postgres.js';
