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
