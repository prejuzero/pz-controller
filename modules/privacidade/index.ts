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
export {
  CancelarEncerramento,
  ConsultarEncerramento,
  EfetivarEncerramentos,
  SolicitarEncerramento,
} from './application/encerramento.js';
export type { EncerramentoListado, ResponsavelPeloEscritorio } from './application/encerramento.js';
export type {
  EncerradorDeSessoes,
  OperacoesDeEncerramento,
  OperacoesDeRetencao,
  RepositorioDeEncerramentos,
} from './application/portas.js';
export { CARENCIA_DO_ENCERRAMENTO_DIAS, situacaoDoEncerramento } from './domain/encerramento.js';
export type { Encerramento, SituacaoDoEncerramento } from './domain/encerramento.js';
export {
  EncerramentosPostgres,
  OperacoesDeEncerramentoPostgres,
  OperacoesDeRetencaoPostgres,
} from './infra/encerramento-postgres.js';
export { AplicarRetencao } from './application/retencao.js';
export type { PrazosDeRetencao } from './application/retencao.js';
export { ExportacoesEmMemoria } from './infra/em-memoria.js';
export { ExportacoesPostgres } from './infra/exportacoes-postgres.js';
