import { z } from 'zod';

import { Instante } from '../canonicos.js';

import type { SaudeAdaptador } from '../canonicos.js';
import type { Uuid } from '@pz/kernel';

/**
 * Assinatura como o gateway de pagamento a informa, já no modelo canônico (HU39, ADR-005). No
 * MVP não há adaptador: plano e situação são definidos à mão pelo administrador; quando houver
 * gateway, ele alimenta a mesma situação por esta porta (e pelos webhooks do gateway).
 */
export const AssinaturaCanonica = z
  .object({
    tenantId: z.uuid(),
    plano: z.string().min(1).max(80),
    situacao: z.enum(['teste', 'ativa', 'inadimplente', 'cancelada']),
    atualizadaEm: Instante,
  })
  .strict();
export type AssinaturaCanonica = z.infer<typeof AssinaturaCanonica>;

export interface ProvedorCobranca {
  /** Situação atual da assinatura do tenant; undefined se o gateway não a conhece. */
  consultarAssinatura(tenantId: Uuid): Promise<AssinaturaCanonica | undefined>;
  saude(): Promise<SaudeAdaptador>;
}
