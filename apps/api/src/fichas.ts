/** Fichas de injeção da api (tokens do container do NestJS). */
export const AMBIENTE = Symbol('AMBIENTE');
export const RELOGIO = Symbol('RELOGIO');
export const VERIFICADORES = Symbol('VERIFICADORES');
/** Gateway de webhooks (HU09): onde gravar e quem verifica a assinatura de cada adaptador. */
export const CAIXA_DE_WEBHOOKS = Symbol('CAIXA_DE_WEBHOOKS');
export const RECEPTORES_DE_WEBHOOK = Symbol('RECEPTORES_DE_WEBHOOK');
