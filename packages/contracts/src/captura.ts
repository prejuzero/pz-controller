import { z } from 'zod';

import { Instante, Uuid } from './comum.js';
import { definirRota, nomear } from './rota.js';

/** Status da captura do escritório (HU19): situação da fonte e cada OAB monitorada. */
export const StatusDaCaptura = nomear(
  'StatusDaCaptura',
  z.object({
    fonte: z.object({
      id: z.string().describe('Fonte de publicações (ex.: djen).'),
      situacao: z.enum(['operacional', 'degradada']),
      desde: Instante.nullable().describe('Desde quando está na situação atual.'),
    }),
    oabs: z.array(
      z.object({
        oabId: Uuid,
        oab: z.string().describe('Número/UF, ex.: 123456/SP.'),
        ultimoSucesso: Instante.nullable().describe('Última captura bem-sucedida.'),
        proximaExecucao: Instante.nullable().describe(
          'Próxima tentativa após falha; nulo: na próxima rodada do agendamento.',
        ),
        falhasConsecutivas: z.number().int().nonnegative(),
      }),
    ),
  }),
);
export type StatusDaCaptura = z.infer<typeof StatusDaCaptura.esquema>;

export const consultarStatusDaCaptura = definirRota({
  id: 'consultarStatusDaCaptura',
  metodo: 'get',
  caminho: '/v1/captura/status',
  resumo: 'Situação da fonte e da captura de cada OAB do escritório.',
  tag: 'captura',
  resposta: { status: 200, corpo: StatusDaCaptura },
});

export const ROTAS_CAPTURA = [consultarStatusDaCaptura] as const;
