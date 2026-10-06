// API pública do módulo calendario (CLAUDE.md, seção 6): outros módulos e as apps só usam o que está aqui.
export {
  AprovarEventoDoCalendario,
  CadastrarFeriadoLocal,
  ConsultarCalendario,
  ConsultarDiasNaoUteis,
  EntradaDiasNaoUteis,
  EntradaDoEvento,
  EntradaRevogacao,
  MAXIMO_DIAS_POR_CONSULTA,
  ProporEventoDoCalendario,
  RevogarEventoDoCalendario,
  RevogarFeriadoLocal,
} from './application/calendario.js';
export type {
  AutorEmAcao,
  EventoGlobalListado,
  EventoListado,
  FeriadoLocalListado,
} from './application/calendario.js';
export {
  COLUNAS_DO_CSV,
  EntradaImportacao,
  ImportarCalendario,
  lerCsv,
  MAXIMO_DE_LINHAS,
} from './application/importacao.js';
export type { LinhaDaPrevia, ResultadoDaImportacao } from './application/importacao.js';
export type {
  FiltroDoCalendario,
  RepositorioDeEventosGlobais,
  RepositorioDeFeriadosLocais,
} from './application/portas.js';
export { diasNaoUteis } from './domain/dias-nao-uteis.js';
export type { DiaNaoUtil, Jurisdicao } from './domain/dias-nao-uteis.js';
export { ABRANGENCIAS, TIPOS_DE_EVENTO } from './domain/evento.js';
export type { Abrangencia, Autor, CalendarioAlterado, TipoDeEvento } from './domain/evento.js';
export { EventosGlobaisEmMemoria, FeriadosLocaisEmMemoria } from './infra/em-memoria.js';
export { EventosGlobaisPostgres, FeriadosLocaisPostgres } from './infra/calendario-postgres.js';
