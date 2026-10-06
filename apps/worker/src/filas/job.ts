import { z } from 'zod';

import type { NomeFila } from '@pz/integracoes';
import type { ContextoPropagavel } from '@pz/observability';

// Catálogo compartilhado com a api (painel e reprocessamento da DLQ, HU07).
export { FILAS, filaDlq, NOMES_FILAS } from '@pz/integracoes';
export type { NomeFila } from '@pz/integracoes';

const ContextoPropagavelJob = z.object({
  traceparent: z.string().optional(),
  tracestate: z.string().optional(),
  requestId: z.string().optional(),
  userId: z.string().optional(),
});

/** Envelope de todo job (job base): validado antes de qualquer processamento. */
export const EnvelopeJob = z.object({
  tipo: z.string().min(1),
  /** Tenant do job; ausente só em job global, que precisa ser marcado explicitamente. */
  escopo: z.union([
    z.object({ tenantId: z.uuid() }).strict(),
    z.object({ global: z.literal(true), motivo: z.string().min(3) }).strict(),
  ]),
  /** Chave de idempotência: a mesma chave nunca gera dois jobs. */
  chave: z.string().min(1).max(200),
  contexto: ContextoPropagavelJob,
  dados: z.unknown(),
});
export type EnvelopeJob = z.infer<typeof EnvelopeJob>;

export interface DefinicaoJob<Dados> {
  readonly fila: NomeFila;
  readonly tipo: string;
  readonly dados: z.ZodType<Dados>;
  /** Job que atravessa tenants (ex.: relay do outbox, captura agendada). */
  readonly global: boolean;
}

/** Declara um tipo de job: fila, nome estável e schema dos dados. */
export function definirJob<Dados>(definicao: {
  fila: NomeFila;
  tipo: string;
  dados: z.ZodType<Dados>;
  global?: boolean;
}): DefinicaoJob<Dados> {
  if (!/^[a-z][a-z0-9.-]*$/.test(definicao.tipo)) {
    throw new Error(
      `Tipo de job deve ser minúsculo, com . ou - (ex.: captura.oab): "${definicao.tipo}"`,
    );
  }
  return { ...definicao, global: definicao.global ?? false };
}

/** ID determinístico do job a partir do tipo e da chave (o BullMQ não aceita ':' em IDs). */
export function idDoJob(tipo: string, chave: string): string {
  return `${tipo}-${chave}`.replace(/:/g, '_');
}

export type Escopo =
  { readonly tenantId: string } | { readonly global: true; readonly motivo: string };

/** Monta o envelope validado; recusa job de tenant sem tenant e job global sem marcação. */
export function montarEnvelope<Dados>(
  definicao: DefinicaoJob<Dados>,
  dados: Dados,
  escopo: Escopo,
  chave: string,
  contexto: ContextoPropagavel,
): EnvelopeJob {
  const global = 'global' in escopo;
  if (global !== definicao.global) {
    throw new Error(
      definicao.global
        ? `O job ${definicao.tipo} é global: informe { global: true, motivo }.`
        : `O job ${definicao.tipo} exige tenantId.`,
    );
  }
  return EnvelopeJob.parse({
    tipo: definicao.tipo,
    escopo,
    chave,
    contexto,
    dados: definicao.dados.parse(dados),
  });
}
