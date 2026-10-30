import { z } from 'zod';

import { definirJob } from '../filas/job.js';

/**
 * Um lote do recálculo dos prazos de um tenant por um CalendarioAlterado (HU16, PZ-142). A chave
 * (evento + tenant + cursor) torna cada lote idempotente; o lote seguinte é outro job.
 */
export const recalcularPrazosJob = definirJob({
  fila: 'prazos',
  tipo: 'prazos.recalcular',
  dados: z
    .object({
      evento: z
        .object({
          id: z.uuid(),
          tenantId: z.uuid(),
          payload: z.record(z.string(), z.unknown()),
        })
        .strict(),
      /** O mesmo do escopo do job: o lote roda nele (RLS). */
      tenantId: z.uuid(),
      depoisDe: z.uuid().nullable(),
    })
    .strict(),
});

export type DadosDoRecalculo = z.infer<typeof recalcularPrazosJob.dados>;

export const chaveDoLote = (dados: DadosDoRecalculo) =>
  `${dados.evento.id}-${dados.tenantId}-${dados.depoisDe ?? 'inicio'}`;
