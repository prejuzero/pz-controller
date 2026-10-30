// API pública do módulo prazos (CLAUDE.md, seção 6): outros módulos e as apps só usam o que está aqui.
export {
  COLUNAS_DA_TABELA,
  EntradaImportacaoDaTabela,
  ImportarTabelaDePrazos,
  MAXIMO_DE_LINHAS_DA_TABELA,
} from './application/importacao.js';
export type {
  LinhaDaPreviaDaTabela,
  ResultadoDaImportacaoDaTabela,
} from './application/importacao.js';
export {
  AprovarVersaoDaTabela,
  CadastrarTipoDeAto,
  ConsultarTabelaDePrazos,
  EntradaProposta,
  EntradaResolucao,
  EntradaTipoDeAto,
  ProporVersaoDaTabela,
  ResolverPrazoAplicavel,
} from './application/tabela-de-prazos.js';
export type { CuradorEmAcao, VersaoListada } from './application/tabela-de-prazos.js';
export type {
  FiltroDeVersoes,
  RepositorioDaTabela,
  RepositorioDeTiposDeAto,
  TipoDeAto,
} from './application/portas.js';
export {
  CODIGO_MANIFESTACAO_GENERICA,
  FUNDAMENTO_PRAZO_DO_ATO,
  resolverPrazo,
} from './domain/resolucao.js';
export type {
  AvisoDaResolucao,
  PrazoDaTabela,
  PrazoNoTexto,
  PrazoResolvido,
} from './domain/resolucao.js';
export {
  CALCULOS,
  CONTAGENS,
  LOCAIS_DO_ATO,
  POLITICAS_DE_DOBRO,
  RAMOS,
  selecionarVigente,
  UNIDADES,
  VersaoDaTabela,
} from './domain/tabela.js';
export type {
  Calculo,
  Contagem,
  Curador,
  LocalDoAto,
  PoliticaDeDobro,
  Ramo,
  TabelaPrazoAprovada,
  Unidade,
} from './domain/tabela.js';
export {
  AjustarPrazo,
  CadastrarPrazoManual,
  EntradaDoPrazoManual,
  CancelarPrazo,
  ConfirmarPrazo,
  ConsultarPrazo,
  CumprirPrazo,
  EntradaDeAjuste,
  EntradaDeCancelamento,
  EntradaDeVersao,
  GerarPrazoDaPublicacao,
  LinkDoDocumento,
  ListarPrazos,
  MarcarPrazosVencidos,
} from './application/ciclo-de-vida.js';
export type {
  AutorDoCadastro,
  AutorNoPrazo,
  NoTenant,
  ResultadoDaGeracao,
} from './application/ciclo-de-vida.js';
export {
  CalcularPrazoParaProcesso,
  CriarPrazo,
  EntradaDoCalculoDoProcesso,
  lerAlteracaoDoCalendario,
  LOTE_DO_RECALCULO,
  prazoDetalhado,
  prazoListado,
  RecalcularPrazosPorCalendario,
  SugestaoDePrazo,
  TenantsAfetadosPeloCalendario,
} from './application/prazos.js';
export type {
  AlteracaoDoCalendario,
  AutorDoPrazo,
  DadosDoNovoPrazo,
  PrazoListado,
  ResultadoDoLote,
} from './application/prazos.js';
export { PainelDosPrazos } from './application/painel.js';
export type { ProximoPrazo, ResumoDosPrazos } from './application/painel.js';
export { RECORTES_DA_LISTA, TIPOS_DE_DIA } from './application/portas.js';
export type {
  AlcanceDaAlteracao,
  ClassificacaoDoConteudo,
  ContagemDoPainel,
  RecorteDaLista,
  RecorteDoPainel,
  DestinatarioDaPublicacao,
  DiaDoCalendario,
  FontesDaGeracao,
  LocalizadorDoProcesso,
  ProcessoNoCalendario,
  RepositorioDePrazos,
  TipoDeDia,
} from './application/portas.js';
export { ORIGENS_DO_PRAZO, Prazo, STATUS_DO_PRAZO } from './domain/prazo.js';
export type {
  CalculoDoPrazo,
  EstadoDoPrazo,
  JurisdicaoDoPrazo,
  OrigemDoPrazo,
  StatusDoPrazo,
} from './domain/prazo.js';
export { PrazosEmMemoria, TabelaEmMemoria } from './infra/em-memoria.js';
export { PrazosPostgres } from './infra/prazos-postgres.js';
export { TabelaPostgres, TiposDeAtoPostgres } from './infra/tabela-postgres.js';
export {
  AgendarCompromisso,
  CancelarCompromisso,
  EntradaDoCompromisso,
  ListarCompromissos,
} from './application/compromissos.js';
export type {
  Compromisso,
  CompromissoListado,
  ProcessoExiste,
  RepositorioDeCompromissos,
} from './application/compromissos.js';
export { CompromissosEmMemoria } from './infra/em-memoria.js';
export { CompromissosPostgres } from './infra/compromissos-postgres.js';
