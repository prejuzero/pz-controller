// API pública do módulo cadastro (CLAUDE.md, seção 6): outros módulos e as apps só usam o que está aqui.
export {
  AdicionarOab,
  AtualizarPerfil,
  CadastrarAdvogado,
  ConsultarPerfil,
  EntradaDoCadastro,
  EntradaDoPerfil,
  RemoverOab,
} from './application/cadastro.js';
export type { AutorDoCadastro, OabListada, PerfilListado } from './application/cadastro.js';
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
export { AdvogadosPostgres } from './infra/advogados-postgres.js';
export { AdvogadosEmMemoria } from './infra/em-memoria.js';
export { ClientesEmMemoria, ProcessosEmMemoria } from './infra/processos-em-memoria.js';
export { ClientesPostgres, ProcessosPostgres } from './infra/processos-postgres.js';
export { ExportacaoDoCadastroPostgres } from './infra/exportacao-postgres.js';
