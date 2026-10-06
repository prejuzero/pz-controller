// API pública do módulo prazos (CLAUDE.md, seção 6): outros módulos e as apps só usam o que está aqui.
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
export { RAMOS, selecionarVigente, UNIDADES, VersaoDaTabela } from './domain/tabela.js';
export type { Curador, Ramo, TabelaPrazoAprovada, Unidade } from './domain/tabela.js';
export { TabelaEmMemoria } from './infra/em-memoria.js';
export { TabelaPostgres, TiposDeAtoPostgres } from './infra/tabela-postgres.js';
