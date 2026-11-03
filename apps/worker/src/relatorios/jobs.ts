import { z } from 'zod';

import { definirJob } from '../filas/job.js';

/** Gera um relatório pedido (HU29) na fila própria; a chave é o id do relatório (idempotente). */
export const gerarRelatorioJob = definirJob({
  fila: 'relatorios',
  tipo: 'relatorios.gerar',
  dados: z.object({ relatorioId: z.uuid(), tenantId: z.uuid() }).strict(),
});
