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
export { sha256, TrilhaPostgres } from './infra/trilha-postgres.js';
