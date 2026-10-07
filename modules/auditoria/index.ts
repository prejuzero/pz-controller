// API pública do módulo auditoria (CLAUDE.md, seção 6): outros módulos e as apps só usam o que está aqui.
export { AuditarEvento, EVENTOS_AUDITADOS } from './application/eventos.js';
export { EntradaDeAuditoria, TIPOS_DE_AUDITORIA, TipoDeAuditoria } from './application/portas.js';
export type { OrigemDaAuditoria, TrilhaDeAuditoria } from './application/portas.js';
export { calcularHash, HASH_GENESE, verificarCadeia } from './domain/cadeia.js';
export type {
  RegistroDeAuditoria,
  RegistroEncadeado,
  ResultadoDaVerificacao,
} from './domain/cadeia.js';
export { jsonCanonico } from './domain/canonico.js';
export {
  dadoPessoal,
  MARCADOR_DADO_PESSOAL,
  substituirDadosPessoais,
} from './domain/dados-pessoais.js';
export type { DadoPessoalMarcado } from './domain/dados-pessoais.js';
export { DadosPessoaisDaTrilhaPostgres, sha256, TrilhaPostgres } from './infra/trilha-postgres.js';
export { ConsultarTrecho, VerificarIntegridade } from './application/integridade.js';
export type {
  Checkpoint,
  DestinoWorm,
  RepositorioDaCadeia,
  ResultadoDoTenant,
} from './application/integridade.js';
export { CadeiaPostgres } from './infra/cadeia-postgres.js';
