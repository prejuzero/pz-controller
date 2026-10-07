// API pública do módulo privacidade (CLAUDE.md, seção 6): outros módulos e as apps só usam o que está aqui.
export {
  ConsultarExportacao,
  EntradaDaExportacao,
  GerarExportacao,
  SolicitarExportacao,
} from './application/exportacao.js';
export type { ExportacaoListada, SolicitanteDaExportacao } from './application/exportacao.js';
export type {
  Exportacao,
  FonteDeExportacao,
  RepositorioDeExportacoes,
} from './application/portas.js';
export { ESCOPOS_DE_EXPORTACAO, paraCsv, paraJson } from './domain/exportacao.js';
export type { EscopoDeExportacao, SecaoExportada, ValorExportado } from './domain/exportacao.js';
export { ExportacoesEmMemoria } from './infra/em-memoria.js';
export { ExportacoesPostgres } from './infra/exportacoes-postgres.js';
