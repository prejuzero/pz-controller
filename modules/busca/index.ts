// API pública do módulo busca (CLAUDE.md, seção 6): outros módulos e as apps só usam o que está aqui.
export { Buscar } from './application/buscar.js';
export type { FontesDaBusca } from './application/buscar.js';
export { ATALHOS, resolverAtalho } from './domain/periodo.js';
export type { Atalho, Intervalo } from './domain/periodo.js';
