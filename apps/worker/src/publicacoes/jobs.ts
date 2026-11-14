import { z } from 'zod';

import { definirJob } from '../filas/job.js';

/** Recalcula as classes processuais vistas nas publicações, para a curadoria (global). */
export const recalcularClassesVistasJob = definirJob({
  fila: 'manutencao',
  tipo: 'publicacoes.recalcular-classes',
  dados: z.object({}).strict(),
  global: true,
});
