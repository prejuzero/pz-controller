/** Fichas de injeção do worker (tokens do container do NestJS). */
export const AMBIENTE = Symbol('AMBIENTE');
export const RELOGIO = Symbol('RELOGIO');
export const VERIFICADORES = Symbol('VERIFICADORES');
/** Portas do outbox (kernel): Banco e OutboxPostgres em produção; em memória nos testes. */
export const UNIDADE_DE_TRABALHO = Symbol('UNIDADE_DE_TRABALHO');
export const REGISTRO_DE_PROCESSAMENTO = Symbol('REGISTRO_DE_PROCESSAMENTO');
/** Conexão Redis (ioredis) e runtime das filas BullMQ (HU10). */
export const REDIS = Symbol('REDIS');
export const FILAS_RUNTIME = Symbol('FILAS_RUNTIME');
/** Banco (pz_app), banco do sistema (pz_sistema) e outbox no PostgreSQL (HU05). */
export const BANCO = Symbol('BANCO');
export const BANCO_SISTEMA = Symbol('BANCO_SISTEMA');
/** Relay: unidade de trabalho como sistema e origem dos eventos pendentes com contexto. */
export const UNIDADE_DO_RELAY = Symbol('UNIDADE_DO_RELAY');
export const FONTE_DO_RELAY = Symbol('FONTE_DO_RELAY');
/** Limpeza agendada do outbox: unidade como sistema e a porta de remoção (HU10). */
export const UNIDADE_DA_LIMPEZA = Symbol('UNIDADE_DA_LIMPEZA');
export const LIMPEZA_DO_OUTBOX = Symbol('LIMPEZA_DO_OUTBOX');
/** Webhooks de entrada (HU09): unidade como sistema e processadores por adaptador. */
export const UNIDADE_DOS_WEBHOOKS = Symbol('UNIDADE_DOS_WEBHOOKS');
export const PROCESSADORES_DE_WEBHOOK = Symbol('PROCESSADORES_DE_WEBHOOK');
