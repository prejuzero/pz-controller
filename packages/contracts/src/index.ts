import { ROTAS_ADMIN } from './admin/index.js';
import { ROTAS_AUTH } from './auth/index.js';
import { ROTAS_CADASTRO } from './cadastro/index.js';
export {
  AlteracaoDoCliente,
  AlteracaoDoProcesso,
  alterarCobertura,
  atualizarCliente,
  atualizarProcesso,
  cadastrarCliente,
  cadastrarProcesso,
  ClienteDoTenant,
  consultarCliente,
  consultarProcesso,
  listarClientes,
  listarProcessos,
  PaginaDeClientes,
  PaginaDeProcessos,
  PedidoDeCliente,
  PedidoDeCobertura,
  PedidoDeProcesso,
  ProcessoDoTenant,
  removerCliente,
  ROTAS_PROCESSOS,
} from './cadastro/processos.js';
import { ROTAS_PROCESSOS } from './cadastro/processos.js';
import { ROTAS_CALENDARIO } from './calendario/index.js';
import { ROTAS_NOTIFICACOES } from './notificacoes/index.js';
import { gerarOpenApi } from './openapi.js';
import { ROTAS_TABELA_PRAZOS } from './prazos/index.js';
import { ROTAS_SAUDE } from './saude/index.js';
import { ROTAS_WEBHOOKS } from './webhooks/index.js';

export {
  encerrarImpersonacao,
  iniciarImpersonacao,
  PedidoDeImpersonacao,
  PedidoDeReprocessamento,
  reprocessarJobMorto,
  ROTAS_ADMIN,
} from './admin/index.js';
export {
  DispositivosDaConta,
  emitirTokensDeDispositivo,
  listarDispositivos,
  PedidoDeRenovacao,
  PedidoDeTokensDeDispositivo,
  renovarTokens,
  revogarDispositivo,
  TokensDeDispositivo,
  PedidoDeRedefinicaoDeSenha,
  RedefinicaoDeSenha,
  redefinirSenha,
  solicitarRedefinicaoDeSenha,
  AcessosRecentes,
  listarAcessos,
  ativarSegundoFator,
  CABECALHO_CSRF,
  COOKIE_CSRF,
  COOKIE_SESSAO,
  CodigoSegundoFator,
  ConfiguracaoSegundoFator,
  configurarSegundoFator,
  consultarSessao,
  Credenciais,
  entrar,
  ROTAS_AUTH,
  sair,
  SegundoFatorAtivado,
  SessaoAtual,
  verificarSegundoFator,
} from './auth/index.js';
export {
  adicionarOab,
  AlteracaoDoPerfil,
  atualizarPerfil,
  CadastroRealizado,
  cadastrarAdvogado,
  consultarPerfil,
  OabDoAdvogado,
  PedidoDeCadastro,
  PedidoDeOab,
  PedidoDeVerificacaoDeEmail,
  PerfilDoAdvogado,
  removerOab,
  ROTAS_CADASTRO,
  verificarEmail,
} from './cadastro/index.js';
export {
  aprovarEventoDoCalendario,
  cadastrarFeriadoLocal,
  ConsultaDoPeriodo,
  consultarDiasNaoUteis,
  consultarDiasNaoUteisDoProcesso,
  DiasNaoUteis,
  DiasNaoUteisDoProcesso,
  EventoDoCalendario,
  EventosDoCalendario,
  FeriadoLocal,
  FeriadosLocais,
  importarCalendario,
  listarCalendarioGlobal,
  listarFeriadosLocais,
  PedidoDeEventoDoCalendario,
  PedidoDeImportacaoDoCalendario,
  PedidoDeRevogacaoDoEvento,
  proporEventoDoCalendario,
  ResultadoDaImportacao,
  revogarEventoDoCalendario,
  revogarFeriadoLocal,
  ROTAS_CALENDARIO,
} from './calendario/index.js';
export {
  aprovarVersaoDaTabela,
  cadastrarTipoDeAto,
  listarTiposDeAto,
  listarVersoesDaTabela,
  PedidoDeTipoDeAto,
  PedidoDeVersaoDaTabela,
  proporVersaoDaTabela,
  ROTAS_TABELA_PRAZOS,
  TipoDeAto,
  TiposDeAto,
  VersaoDaTabela,
  VersoesDaTabela,
} from './prazos/index.js';
export {
  CABECALHO_IDEMPOTENCIA,
  ChaveIdempotencia,
  ConsultaPaginada,
  DataCivil,
  Instante,
  LIMITE_MAXIMO,
  LIMITE_PADRAO,
  pagina,
  Problema,
  Uuid,
} from './comum.js';
export { formatarNumeroCnj, lerNumeroCnj, TRIBUNAIS, tribunalDoNumero } from './cnj.js';
export type { PartesDoNumeroCnj, Tribunal } from './cnj.js';
export {
  CalendarioAlterado,
  CapturaConcluida,
  catalogoDeEventos,
  CoberturaAlterada,
  ConsentimentoCanalAlterado,
  ContaBloqueada,
  definirEvento,
  EVENTOS,
  ProcessoMonitorado,
  RedefinicaoDeSenhaSolicitada,
  SituacaoVerificada,
} from './eventos/index.js';
export type { ContratoEvento } from './eventos/index.js';
export {
  AvisosDeEntrega,
  concederConsentimento,
  ConsentimentoDoCanal,
  ConsentimentosDoUsuario,
  consultarAvisosDeEntrega,
  desativarDestinoPush,
  DestinoPushRegistrado,
  listarConsentimentos,
  PedidoDeConsentimento,
  PedidoDeDestinoPush,
  registrarDestinoPush,
  revogarConsentimento,
  ROTAS_NOTIFICACOES,
} from './notificacoes/index.js';
export { gerarOpenApi } from './openapi.js';
export type { OpcoesOpenApi } from './openapi.js';
export { definirRota, nomear } from './rota.js';
export type { EsquemaNomeado, MetodoHttp, Rota, StatusDeErro } from './rota.js';
export { consultarSituacao, ROTAS_SAUDE, SituacaoDaApi } from './saude/index.js';
export { receberWebhook, ROTAS_WEBHOOKS, WebhookAceito } from './webhooks/index.js';

/** Todas as rotas da API `/v1`. Cada módulo novo acrescenta as suas aqui. */
export const ROTAS = [
  ...ROTAS_AUTH,
  ...ROTAS_ADMIN,
  ...ROTAS_CADASTRO,
  ...ROTAS_PROCESSOS,
  ...ROTAS_CALENDARIO,
  ...ROTAS_TABELA_PRAZOS,
  ...ROTAS_NOTIFICACOES,
  ...ROTAS_SAUDE,
  ...ROTAS_WEBHOOKS,
] as const;

/** O documento OpenAPI 3.1 da API, gerado das rotas (é o que `openapi.json` guarda). */
export function documentoOpenApi(): Record<string, unknown> {
  return gerarOpenApi({
    titulo: 'PrejuZero API',
    versao: '1',
    descricao:
      'API do PrejuZero. Erros em application/problem+json (RFC 9457), paginação por cursor e Idempotency-Key em operações sensíveis (ADR-009).',
    rotas: ROTAS,
  });
}
