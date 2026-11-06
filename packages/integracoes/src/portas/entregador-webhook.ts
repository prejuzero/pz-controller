import { z } from 'zod';

import type { SaudeAdaptador } from '../canonicos.js';

/** Webhook de saída pronto para envio (HU49): corpo já serializado e assinado pelo módulo. */
export const EntregaWebhook = z
  .object({
    url: z.url({ protocol: /^https?$/ }),
    /** Bytes exatos que a assinatura cobre. */
    corpo: z.string().max(65_536),
    cabecalhos: z.record(z.string().regex(/^[a-z0-9-]+$/), z.string().max(1000)),
  })
  .strict();
export type EntregaWebhook = z.infer<typeof EntregaWebhook>;

/**
 * Desfecho da entrega, sempre como valor: o endereço é do integrador, e a falha de um não pode
 * abrir o circuito de todos. `resposta`: o servidor respondeu (qualquer status); `falha`: não
 * chegou (rede, DNS, timeout) ou o endereço foi recusado (rede interna, redirecionamento).
 */
export const ResultadoEntregaWebhook = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('resposta'), status: z.int().min(100).max(599) }).strict(),
  z
    .object({
      tipo: z.literal('falha'),
      motivo: z.enum(['rede', 'timeout', 'endereco-recusado', 'redirecionamento']),
    })
    .strict(),
]);
export type ResultadoEntregaWebhook = z.infer<typeof ResultadoEntregaWebhook>;

/** Envia webhooks de saída por HTTP (ADR-023). Só POST, sem seguir redirecionamentos. */
export interface EntregadorWebhook {
  entregar(entrega: EntregaWebhook): Promise<ResultadoEntregaWebhook>;
  saude(): Promise<SaudeAdaptador>;
}
