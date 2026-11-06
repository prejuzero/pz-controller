import { z } from 'zod';

import { definirJob } from '../filas/job.js';

/**
 * Envia uma entrega de webhook (HU49) na fila `integracoes`: a retentativa com espera crescente
 * e a DLQ são as da fila; esgotadas as tentativas, a entrega aparece como falha na tela.
 */
export const entregarWebhookJob = definirJob({
  fila: 'integracoes',
  tipo: 'webhooks.entregar',
  dados: z.object({ entregaId: z.uuid(), tenantId: z.uuid() }).strict(),
});
