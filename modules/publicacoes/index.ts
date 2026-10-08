// API pública do módulo publicacoes (CLAUDE.md, seção 6): outros módulos e as apps só usam o que está aqui.
export { IngerirCaptura } from './application/ingestao.js';
export type { ResultadoDaIngestao } from './application/ingestao.js';
export type {
  ConteudoRegistrado,
  NovoDestinatario,
  ObterOuCriarProcessoNoTenant,
  PublicacaoParaRegistrar,
  RepositorioDePublicacoes,
} from './application/portas.js';
export { ExportacaoDasPublicacoesPostgres } from './infra/exportacao-postgres.js';
export { PublicacoesPostgres } from './infra/publicacoes-postgres.js';
