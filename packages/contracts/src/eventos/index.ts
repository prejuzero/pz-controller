import { z } from 'zod';

import { catalogoDeEventos, definirEvento } from './evento.js';

export { catalogoDeEventos, definirEvento } from './evento.js';
export type { ContratoEvento } from './evento.js';

/** Exemplo do módulo "saude": emitido a cada verificação da situação da API. */
export const SituacaoVerificada = definirEvento(
  'SituacaoVerificada',
  1,
  z.object({ situacao: z.enum(['operacional', 'degradada']) }),
);

/** Pedido de redefinição de senha (HU06): o token vai cifrado; o worker envia o e-mail. */
export const RedefinicaoDeSenhaSolicitada = definirEvento(
  'RedefinicaoDeSenhaSolicitada',
  1,
  z.object({ usuarioId: z.uuid(), tokenCifrado: z.string().min(1) }),
);

/** Conta ou 2FA bloqueado por tentativas erradas (HU06): o titular é avisado por e-mail. */
export const ContaBloqueada = definirEvento(
  'ContaBloqueada',
  1,
  z.object({
    usuarioId: z.uuid(),
    motivo: z.enum(['login', 'segundo-fator']),
    bloqueadaAte: z.iso.datetime(),
  }),
);

export const EVENTOS = catalogoDeEventos(
  SituacaoVerificada,
  RedefinicaoDeSenhaSolicitada,
  ContaBloqueada,
);
