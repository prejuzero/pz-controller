import { z } from 'zod';

import { Instante } from './comum.js';
import { nomear } from './rota.js';

/**
 * Origem de uma sugestão de IA (HU58, ADR-016): acompanha toda resposta persistida para a
 * interface mostrar "sugerido por IA" e para saber qual modelo e qual prompt a geraram.
 */
export const OrigemIa = nomear(
  'OrigemIa',
  z.object({
    modelo: z.string().min(1),
    provedor: z.string().min(1),
    /** `tarefa@x.y.z` do registro de prompts. */
    versaoPrompt: z.string().regex(/^[a-z][a-z0-9-]*@\d+\.\d+\.\d+$/),
    versaoConfiguracao: z.string().min(1),
    confianca: z.number().min(0).max(1).nullable(),
    geradoEm: Instante,
  }),
);
export type OrigemIa = z.infer<typeof OrigemIa.esquema>;
