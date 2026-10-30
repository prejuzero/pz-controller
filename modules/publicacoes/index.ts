// API pública do módulo publicacoes (CLAUDE.md, seção 6): outros módulos e as apps só usam o que está aqui.
export { IngerirCaptura } from './application/ingestao.js';
export {
  BuscarPublicacoes,
  ConsultarPublicacao,
  ContarPublicacoesNovas,
  MAXIMO_DE_CONTEUDOS_POR_TEXTO,
  TETO_DA_CONTAGEM_DE_PUBLICACOES,
  ListarPublicacoes,
  MarcarComoLida,
} from './application/leitura.js';
export type { LeitorNoTenant, Pagina } from './application/leitura.js';
export type { ResultadoDaIngestao } from './application/ingestao.js';
export type {
  ConteudoRegistrado,
  NovoDestinatario,
  ObterOuCriarProcessoNoTenant,
  PublicacaoParaRegistrar,
  FiltroDaBuscaDePublicacoes,
  FiltroDePublicacoes,
  PublicacaoDoTenant,
  RepositorioDeLeitura,
  RepositorioDePublicacoes,
} from './application/portas.js';
export { DestinatariosPostgres } from './infra/destinatarios-postgres.js';
export type { DestinatarioLido } from './infra/destinatarios-postgres.js';
export { ExportacaoDasPublicacoesPostgres } from './infra/exportacao-postgres.js';
export { LeituraPostgres } from './infra/leitura-postgres.js';
export { PublicacoesPostgres } from './infra/publicacoes-postgres.js';
export { TeoresPostgres } from './infra/teores-postgres.js';
