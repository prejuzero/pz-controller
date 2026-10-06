/** Fichas de injeção do worker (tokens do container do NestJS). */
export const AMBIENTE = Symbol('AMBIENTE');
export const RELOGIO = Symbol('RELOGIO');
export const VERIFICADORES = Symbol('VERIFICADORES');
/** Portas do outbox (kernel). Em memória até a HU05 (Postgres) e a HU10 (relay com filas). */
export const UNIDADE_DE_TRABALHO = Symbol('UNIDADE_DE_TRABALHO');
export const FILA_DO_RELAY = Symbol('FILA_DO_RELAY');
export const REGISTRO_DE_PROCESSAMENTO = Symbol('REGISTRO_DE_PROCESSAMENTO');
/** Conexão Redis (ioredis) e runtime das filas BullMQ (HU10). */
export const REDIS = Symbol('REDIS');
export const FILAS_RUNTIME = Symbol('FILAS_RUNTIME');
