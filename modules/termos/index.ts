// API pública do módulo termos (CLAUDE.md, seção 6): outros módulos e as apps só usam o que está aqui.
export {
  AceitarDocumento,
  ConsultarDocumentosVigentes,
  ConsultarTermosPendentes,
  ListarAceites,
  ListarVersoesDosDocumentos,
  PublicarDocumentoLegal,
} from './application/termos.js';
export type { ContextoDoAceite, Publicador, UsuarioDaSessao } from './application/termos.js';
export type {
  NovoAceite,
  RepositorioDeAceites,
  RepositorioDeDocumentos,
  UnidadeNoTenant,
} from './application/portas.js';
export { compararVersoes, pendentes, TIPOS_DE_DOCUMENTO } from './domain/documento.js';
export type { Aceite, DocumentoLegal, NovaVersao, TipoDeDocumento } from './domain/documento.js';
export { TermosEmMemoria } from './infra/em-memoria.js';
export { AceitesPostgres, DocumentosPostgres } from './infra/termos-postgres.js';
export { ExportacaoDosTermosPostgres } from './infra/exportacao-postgres.js';
