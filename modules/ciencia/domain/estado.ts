/**
 * Estados da ciência de um prazo (HU33, RF71), em ordem. Entregue, aberto e visualizado são só
 * indícios; ciência é a confirmação explícita (ou o cumprimento, que a pressupõe).
 */
export const ESTADOS_DA_CIENCIA = [
  'nao-enviado',
  'enviado',
  'entregue',
  'aberto',
  'visualizado',
  'confirmado',
  'cumprido',
] as const;
export type EstadoDaCiencia = (typeof ESTADOS_DA_CIENCIA)[number];

/** O estado nunca regride: um evento atrasado ou repetido não desfaz a confirmação. */
export function avancar(atual: EstadoDaCiencia, novo: EstadoDaCiencia): EstadoDaCiencia {
  return ESTADOS_DA_CIENCIA.indexOf(novo) > ESTADOS_DA_CIENCIA.indexOf(atual) ? novo : atual;
}

export const contaComoCiencia = (estado: EstadoDaCiencia) =>
  estado === 'confirmado' || estado === 'cumprido';

/**
 * Canal da confirmação: o link do e-mail ou um cliente autenticado. `mobile` é o app oficial
 * (HU68), derivado da sessão OAuth dele e nunca informado pelo app; `app` é o dispositivo
 * registrado por senha (HU06).
 */
export const CANAIS_DA_CONFIRMACAO = ['email', 'portal', 'app', 'mobile'] as const;
export type CanalDaConfirmacao = (typeof CANAIS_DA_CONFIRMACAO)[number];

/** Validade do link de ciência (HU33): 7 dias, uso único. */
export const VALIDADE_DO_TOKEN_MS = 7 * 24 * 3_600_000;
