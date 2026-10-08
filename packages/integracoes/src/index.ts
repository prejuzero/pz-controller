export {
  DataJuridica,
  Instante,
  JanelaDeBusca,
  LinkHttps,
  NumeroCnj,
  Oab,
  SaudeAdaptador,
  Uf,
  UFS,
} from './canonicos.js';
export { definirDescritor, DescritorAdaptador, NOMES_PORTAS, NomePorta } from './descritor.js';
export {
  ErroCredencialInvalida,
  ErroIntegracao,
  ErroLimiteExcedido,
  ErroPermanente,
  ErroTransitorio,
} from './erros.js';
export type { TipoErroIntegracao } from './erros.js';
export { FILAS, filaDlq, NOMES_FILAS } from './filas.js';
export type { NomeFila } from './filas.js';
export { LimitadorEmMemoria } from './limitador.js';
export type { LimitadorDeTaxa } from './limitador.js';
export { LimitadorRedis } from './limitador-redis.js';
export type { ClienteRedisComScript } from './limitador-redis.js';
export { ConfiguracaoIntegracoes, RegistroDeAdaptadores } from './registro.js';
export type { MapaDePortas } from './registro.js';
export { POLITICA_PADRAO, sinalDaChamada } from './resiliencia.js';
export type { PoliticaDeResiliencia } from './resiliencia.js';
export type { SituacaoAdaptador } from './saude.js';
export { CaminhoArquivo, chaveDoArquivo, MetadadosArquivo } from './portas/armazenamento.js';
export type {
  ArmazenamentoArquivos,
  ArquivoParaGravar,
  PedidoUrlAssinada,
} from './portas/armazenamento.js';
export {
  CapacidadesCanal,
  EventoEntrega,
  MensagemNotificacao,
  ResultadoEnvio,
} from './portas/canal-notificacao.js';
export type { CanalNotificacao } from './portas/canal-notificacao.js';
export { PublicacaoCapturada } from './portas/fonte-publicacoes.js';
export type { FontePublicacoes } from './portas/fonte-publicacoes.js';
export { AssinaturaCanonica } from './portas/provedor-cobranca.js';
export type { ProvedorCobranca } from './portas/provedor-cobranca.js';
export { EmailCanonico } from './portas/provedor-email.js';
export type { ProvedorEmail } from './portas/provedor-email.js';
export { MensagemIA, PromptIA } from './portas/provedor-ia.js';
export type {
  FerramentaIA,
  OpcoesIA,
  ProvedorIA,
  RespostaIA,
  UsoIA,
} from './portas/provedor-ia.js';
export type { ReceptorWebhook, RequisicaoWebhook } from './webhook.js';
