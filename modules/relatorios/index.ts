// API pública do módulo relatorios (CLAUDE.md, seção 6): outros módulos e as apps só usam o que está aqui.
export {
  caminhoDoArquivo,
  ConsultarRelatorios,
  GerarArquivo,
  GerarRelatorio,
  SolicitarRelatorio,
} from './application/relatorios.js';
export type {
  ArquivoGerado,
  PedidoDeArquivo,
  RelatorioListado,
  ResultadoDaGeracao,
  Solicitante,
} from './application/relatorios.js';
export type {
  FonteDosRelatorios,
  Pagina,
  Relatorio,
  Renderizador,
  RepositorioDeRelatorios,
} from './application/portas.js';
export { FORMATOS, MAXIMO_DE_LINHAS, TIPOS_DE_RELATORIO } from './domain/relatorio.js';
export type {
  Documento,
  Formato,
  PrazoDoRelatorio,
  PublicacaoDoRelatorio,
  TipoDeRelatorio,
} from './domain/relatorio.js';
export { RelatoriosEmMemoria } from './infra/em-memoria.js';
export { RelatoriosPostgres } from './infra/relatorios-postgres.js';
export { RenderizadorPdf } from './infra/renderizador-pdf.js';
export { RenderizadorXlsx } from './infra/renderizador-xlsx.js';
