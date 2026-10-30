import { z } from 'zod';

import { definirJob } from '../filas/job.js';

/** Disparo dos lembretes devidos de todos os tenants (HU31): global, a cada minuto. */
export const dispararLembretesJob = definirJob({
  fila: 'notificacoes',
  tipo: 'notificacoes.disparar-lembretes',
  dados: z.object({}).strict(),
  global: true,
});

/** Resumos diários de quem tem o horário na janela (HU31): global, a cada 15 minutos. */
export const enviarResumosJob = definirJob({
  fila: 'notificacoes',
  tipo: 'notificacoes.enviar-resumos',
  dados: z.object({}).strict(),
  global: true,
});
