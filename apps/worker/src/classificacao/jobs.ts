import { z } from 'zod';

import { definirJob } from '../filas/job.js';

/** Refaz as classificações que a IA não conseguiu fazer (global: a classificação é por conteúdo). */
export const reprocessarFalhasDaIaJob = definirJob({
  fila: 'classificacao',
  tipo: 'classificacao.reprocessar-falhas',
  dados: z.object({}).strict(),
  global: true,
});
