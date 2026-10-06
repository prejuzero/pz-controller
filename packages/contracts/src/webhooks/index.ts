import { z } from 'zod';

import { definirRota, nomear } from '../rota.js';

export const WebhookAceito = nomear(
  'WebhookAceito',
  z.object({
    duplicado: z.boolean().describe('O mesmo webhook (ID externo) já tinha sido recebido.'),
  }),
);
export type WebhookAceito = z.infer<typeof WebhookAceito.esquema>;

/**
 * Gateway único de webhooks de entrada (ADR-005): o adaptador verifica a assinatura sobre o
 * corpo bruto; o corpo é gravado e processado depois, na fila `integracoes`.
 */
export const receberWebhook = definirRota({
  id: 'receberWebhook',
  metodo: 'post',
  caminho: '/v1/webhooks/{adaptador}',
  resumo: 'Recebe o webhook de um provedor (assinatura verificada pelo adaptador).',
  tag: 'integracoes',
  publica: true,
  parametrosDeCaminho: z.object({ adaptador: z.string().regex(/^[a-z][a-z0-9-]*$/) }),
  resposta: { status: 202, corpo: WebhookAceito },
  erros: [401, 404],
});

export const ROTAS_WEBHOOKS = [receberWebhook] as const;
