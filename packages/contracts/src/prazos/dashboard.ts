import { z } from 'zod';

import { DataCivil, Uuid } from '../comum.js';
import { definirRota, nomear } from '../rota.js';

import { Prazo } from './prazos.js';

/**
 * Filtro global do dashboard (HU26), igual nos três endpoints. Período e cliente ainda não
 * entram (pendência no quadro).
 */
export const FiltroDoDashboard = z.object({
  responsavelId: Uuid.optional().describe('Advogado responsável pelo prazo.'),
  tribunal: z.string().trim().min(1).max(20).optional().describe('Sigla do tribunal.'),
});

export const ResumoDoDashboard = nomear(
  'ResumoDoDashboard',
  z.object({
    vencemHoje: z.number().int().nonnegative(),
    proximos7Dias: z.number().int().nonnegative().describe('De amanhã até hoje + 7 dias.'),
    vencidosNaoCumpridos: z.number().int().nonnegative(),
    novasPublicacoes: z.number().int().nonnegative().describe('Ainda não lidas no escritório.'),
    aguardandoConfirmacao: z.number().int().nonnegative(),
    processosMonitorados: z.number().int().nonnegative(),
    semCienciaConfirmada: z
      .number()
      .int()
      .nonnegative()
      .describe('Prazos abertos sem ciência confirmada (RF81).'),
  }),
);
export type ResumoDoDashboard = z.infer<typeof ResumoDoDashboard.esquema>;

export const LinhaDoTempo = nomear(
  'LinhaDoTempo',
  z.object({
    itens: z
      .array(z.object({ data: DataCivil, quantidade: z.number().int().nonnegative() }))
      .describe('Um item por dia a partir de hoje, inclusive os dias sem prazo.'),
  }),
);
export type LinhaDoTempo = z.infer<typeof LinhaDoTempo.esquema>;

export const ProximosPrazos = nomear(
  'ProximosPrazos',
  z.object({
    itens: z.array(
      Prazo.esquema.extend({
        diasUteisRestantes: z
          .number()
          .int()
          .nonnegative()
          .nullable()
          .describe('Do motor, pelo calendário do processo; null se não foi possível contar.'),
      }),
    ),
  }),
);
export type ProximosPrazos = z.infer<typeof ProximosPrazos.esquema>;

export const resumoDoDashboard = definirRota({
  id: 'resumoDoDashboard',
  metodo: 'get',
  caminho: '/v1/dashboard/resumo',
  resumo: 'Contadores dos cards do dashboard.',
  tag: 'dashboard',
  consulta: FiltroDoDashboard,
  resposta: { status: 200, corpo: ResumoDoDashboard },
});

export const linhaDoTempoDoDashboard = definirRota({
  id: 'linhaDoTempoDoDashboard',
  metodo: 'get',
  caminho: '/v1/dashboard/linha-do-tempo',
  resumo: 'Prazos abertos por dia de vencimento.',
  tag: 'dashboard',
  consulta: FiltroDoDashboard.extend({
    dias: z.coerce.number().int().min(1).max(90).default(30),
  }),
  resposta: { status: 200, corpo: LinhaDoTempo },
});

export const proximosPrazosDoDashboard = definirRota({
  id: 'proximosPrazosDoDashboard',
  metodo: 'get',
  caminho: '/v1/dashboard/proximos-prazos',
  resumo: 'Prazos abertos a vencer, do mais próximo, com os dias úteis restantes.',
  tag: 'dashboard',
  consulta: FiltroDoDashboard.extend({
    limite: z.coerce.number().int().min(1).max(50).default(10),
  }),
  resposta: { status: 200, corpo: ProximosPrazos },
});

export const ROTAS_DASHBOARD = [
  resumoDoDashboard,
  linhaDoTempoDoDashboard,
  proximosPrazosDoDashboard,
] as const;
