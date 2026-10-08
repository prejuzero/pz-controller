// API pública do módulo classificacao (CLAUDE.md, seção 6): outros módulos e as apps só usam o que está aqui.
export { ClassificarPorRegras } from './application/classificar.js';
export type { RepositorioDeRegras } from './application/classificar.js';
export { extrairPrazosCitados, UNIDADES_DE_PRAZO } from './domain/prazo-citado.js';
export type { PrazoCitado, UnidadeDePrazo } from './domain/prazo-citado.js';
export { classificarPorRegras } from './domain/regras.js';
export type { RegraRapida, ResultadoDasRegras } from './domain/regras.js';
export type { Evidencia } from './domain/texto.js';
export { RegrasEmMemoria } from './infra/em-memoria.js';
export { RegrasPostgres } from './infra/regras-postgres.js';
export { ClassificarPublicacao } from './application/classificar-publicacao.js';
export type {
  ClassificadorIa,
  DependenciasDaClassificacao,
  LeitorDeTeor,
  RepositorioDeClassificacoes,
  Taxonomia,
  TipoDaTaxonomia,
} from './application/classificar-publicacao.js';
export { ATO_DESCONHECIDO, CONFIANCA_MINIMA, decidir } from './domain/decisao.js';
export type { Classificacao, RespostaDaIa } from './domain/decisao.js';
export { ClassificacoesPostgres } from './infra/classificacoes-postgres.js';
export {
  ClassificadorIaPlataforma,
  SaidaDaClassificacao,
  TAREFA as TAREFA_DE_CLASSIFICACAO,
} from './infra/classificador-ia-plataforma.js';
export { TaxonomiaPostgres } from './infra/taxonomia-postgres.js';
export { ListarRevisaoManual } from './application/fila-de-revisao.js';
export type {
  ConsultaDaRevisaoManual,
  ItemDaRevisaoManual,
  PaginaDaRevisaoManual,
} from './application/fila-de-revisao.js';
export { RevisaoManualEmMemoria } from './infra/fila-de-revisao-em-memoria.js';
export { RevisaoManualPostgres } from './infra/fila-de-revisao-postgres.js';
