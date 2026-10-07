import { z } from 'zod';

import { definirAgendamento } from '../filas/agendamento.js';
import { definirJob } from '../filas/job.js';

import type { Agendamento } from '../filas/agendamento.js';

/** Efetivação dos encerramentos vencidos (HU38): global, papel sistema, uma vez por dia. */
export const efetivarEncerramentosJob = definirJob({
  fila: 'manutencao',
  tipo: 'privacidade.efetivar-encerramentos',
  dados: z.object({}).strict(),
  global: true,
});

export const AGENDAMENTO_DOS_ENCERRAMENTOS: Agendamento<unknown> = definirAgendamento({
  id: 'privacidade.efetivar-encerramentos',
  job: efetivarEncerramentosJob,
  cron: '30 2 * * *', // diário às 2h30, fora do expediente
  dados: {},
  motivo: 'efetivação dos encerramentos de conta vencidos (LGPD, carência de 30 dias)',
});
