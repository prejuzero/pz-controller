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

export const EVENTOS = catalogoDeEventos(SituacaoVerificada);
