// API pública do módulo cadastro (CLAUDE.md, seção 6): outros módulos e as apps só usam o que está aqui.
export {
  AdicionarOab,
  AtualizarPerfil,
  CadastrarAdvogado,
  ConsultarPerfil,
  EntradaDoCadastro,
  EntradaDoPerfil,
  ListarAdvogadosDaEquipe,
  RemoverOab,
} from './application/cadastro.js';
export type {
  AdvogadoDaEquipe,
  AutorDoCadastro,
  OabListada,
  PerfilListado,
} from './application/cadastro.js';
export {
  AtualizarCliente,
  CadastrarCliente,
  ConsultarCliente,
  ListarClientes,
  RemoverCliente,
} from './application/clientes.js';
export type { ClienteListado } from './application/clientes.js';
export type { AutorNoTenant, Pagina } from './application/paginacao.js';
export {
  AlterarCobertura,
  AtualizarProcesso,
  CadastrarProcesso,
  ConsultarProcesso,
  ContarProcessos,
  ListarProcessos,
  ObterOuCriarProcesso,
} from './application/processos.js';
export type { DadosDaFonte, ProcessoListado } from './application/processos.js';
export type {
  ContaPreparada,
  CriadorDeConta,
  PreparadorDeVerificacao,
  RepositorioDeAdvogados,
  RepositorioDeClientes,
  RepositorioDeProcessos,
  UnidadeNoTenant,
} from './application/portas.js';
export type {
  AdvogadoCadastrado,
  EventoDoCadastro,
  OabAdicionada,
  OabRemovida,
} from './domain/advogado.js';
export {
  MAXIMO_DE_PROCESSOS_NA_BUSCA,
  OabsParaBusca,
  ProcessosParaBusca,
} from './application/busca.js';
export type { FiltroDeProcessosNaBusca } from './application/portas.js';
export { COBERTURAS } from './domain/processo.js';
export type { Cobertura, CoberturaAlterada, ProcessoMonitorado } from './domain/processo.js';
export { UFS } from './domain/valores.js';
export {
  AdvogadosPostgres,
  EmailsAdicionaisDosAdvogadosPostgres,
} from './infra/advogados-postgres.js';
export { AdvogadosEmMemoria } from './infra/em-memoria.js';
export {
  ClientesEmMemoria,
  ImportacoesEmMemoria,
  ProcessosEmMemoria,
} from './infra/processos-em-memoria.js';
export {
  ConsultarImportacaoDeProcessos,
  EntradaDaImportacao,
  ImportarProcessos,
  ProcessarImportacaoDeProcessos,
} from './application/importacao.js';
export type {
  DesfechoDaImportacao,
  ImportacaoConsultada,
  LinhaDaPrevia,
  ResultadoDaImportacao,
} from './application/importacao.js';
export type { ImportacaoDeProcessos, RepositorioDeImportacoes } from './application/portas.js';
export { COLUNAS_DA_IMPORTACAO, MAXIMO_DE_LINHAS_DA_IMPORTACAO } from './domain/importacao.js';
export { ImportacoesPostgres } from './infra/importacoes-postgres.js';
export { ClientesPostgres, ProcessosPostgres } from './infra/processos-postgres.js';
export { ExportacaoDoCadastroPostgres } from './infra/exportacao-postgres.js';
export {
  ConsultarConferencias,
  EntradaDaConferencia,
  RegistrarConferencia,
} from './application/conferencias.js';
export type {
  ConferenciaPendente,
  ConferenciaRegistrada,
  ProcessoParaConferir,
  RepositorioDeConferencias,
  TenantsComConferencia,
} from './application/conferencias.js';
export {
  exigeConferencia,
  MAXIMO_DIAS_DA_CONFERENCIA,
  PERIODICIDADE_PADRAO,
  RESULTADOS_DA_CONFERENCIA,
} from './domain/conferencia.js';
export type { ResultadoDaConferencia } from './domain/conferencia.js';
export {
  ConferenciasPostgres,
  TenantsComConferenciaPostgres,
} from './infra/conferencias-postgres.js';
export { RecifrarCamposSensiveis } from './application/recifra.js';
export type { CampoParaRecifrar, CamposSensiveis } from './application/recifra.js';
export type { ProtecaoDeCampos } from './application/portas.js';
export { CamposSensiveisPostgres } from './infra/campos-sensiveis-postgres.js';
