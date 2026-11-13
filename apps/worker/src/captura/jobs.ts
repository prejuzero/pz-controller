import { z } from 'zod';

import { definirAgendamento } from '../filas/agendamento.js';
import { definirJob } from '../filas/job.js';

import type { Agendamento } from '../filas/agendamento.js';

const MOTIVO = 'captura de publicações: alvos globais, uma consulta por OAB ou processo';

/** Planeja a execução (HU17): um job por alvo devido, com jitter. */
export const planejarCapturaJob = definirJob({
  fila: 'captura',
  tipo: 'captura.planejar',
  dados: z.object({}).strict(),
  global: true,
});

/** Captura de um alvo numa janela; a chave (alvo + janela) torna o job idempotente. */
export const executarCapturaJob = definirJob({
  fila: 'captura',
  tipo: 'captura.executar',
  dados: z
    .object({
      alvoId: z.uuid(),
      tipo: z.enum(['oab', 'processo', 'nome']),
      valor: z.string().min(1),
      inicio: z.iso.date(),
      fim: z.iso.date(),
      /** Rodada (agendada ou "buscar agora"): entra na chave; ausente nos jobs anteriores a ela. */
      rodada: z.string().min(1).max(100).optional(),
    })
    .strict(),
  global: true,
});

/** ID do agendador da captura no Redis (o mesmo em todas as réplicas). */
export const ID_DO_AGENDAMENTO_DA_CAPTURA = 'captura.planejar';

export const ESCOPO_DA_CAPTURA = { global: true, motivo: MOTIVO } as const;

/** Agendamento da captura com o cron do ambiente (configurável, CAPTURA_CRON). */
export function agendamentoDaCaptura(cron: string): Agendamento<unknown> {
  return definirAgendamento({
    id: ID_DO_AGENDAMENTO_DA_CAPTURA,
    job: planejarCapturaJob,
    cron,
    dados: {},
    motivo: MOTIVO,
  });
}
