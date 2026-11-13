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
      proximaRodada: Instante.nullable().describe(
        'Próxima busca automática agendada (cada OAB entra em até alguns minutos depois); nulo: ainda não agendada.',
      ),
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
        buscaAgoraLiberadaEm: Instante.nullable().describe(
          'Quando um novo "buscar agora" desta OAB é aceito (intervalo mínimo entre pedidos); nulo: já pode.',
        ),
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

export const BuscaAgoraSolicitada = nomear(
  'BuscaAgoraSolicitada',
  z.object({
    solicitadaEm: Instante.describe('Instante do pedido, pelo relógio do servidor.'),
  }),
);
export type BuscaAgoraSolicitada = z.infer<typeof BuscaAgoraSolicitada.esquema>;

export const solicitarBuscaAgora = definirRota({
  id: 'solicitarBuscaAgora',
  metodo: 'post',
  caminho: '/v1/captura/oabs/{id}/buscar-agora',
  resumo:
    'Pede a busca imediata das publicações de uma OAB do escritório; as publicações chegam em alguns minutos. Um pedido por OAB a cada 5 minutos (409 antes disso).',
  tag: 'captura',
  parametrosDeCaminho: z.object({ id: Uuid }),
  resposta: { status: 202, corpo: BuscaAgoraSolicitada },
  erros: [404, 409],
});

export const ROTAS_CAPTURA = [consultarStatusDaCaptura, solicitarBuscaAgora] as const;
