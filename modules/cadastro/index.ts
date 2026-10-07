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
export type {
  ContaPreparada,
  CriadorDeConta,
  PreparadorDeVerificacao,
  RepositorioDeAdvogados,
  UnidadeNoTenant,
} from './application/portas.js';
export type {
  AdvogadoCadastrado,
  EventoDoCadastro,
  OabAdicionada,
  OabRemovida,
} from './domain/advogado.js';
export { UFS } from './domain/valores.js';
export { AdvogadosPostgres } from './infra/advogados-postgres.js';
export { AdvogadosEmMemoria } from './infra/em-memoria.js';
