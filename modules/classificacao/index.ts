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
