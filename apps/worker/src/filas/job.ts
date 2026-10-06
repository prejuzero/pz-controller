import { z } from 'zod';

import type { ContextoPropagavel } from '@pz/observability';

/**
 * Catálogo das filas (HU10). Cada grupo pode rodar num serviço próprio (WORKER_QUEUES) e
 * escalar pela profundidade. Retentativa exponencial: atraso = atrasoBaseMs × 2^(tentativa-1).
 */
export const FILAS = {
  eventos: { tentativas: 8, atrasoBaseMs: 1_000, concorrencia: 20 },
  captura: { tentativas: 5, atrasoBaseMs: 30_000, concorrencia: 5 },
  ingestao: { tentativas: 5, atrasoBaseMs: 5_000, concorrencia: 10 },
  classificacao: { tentativas: 5, atrasoBaseMs: 10_000, concorrencia: 5 },
  prazos: { tentativas: 5, atrasoBaseMs: 2_000, concorrencia: 10 },
  notificacoes: { tentativas: 6, atrasoBaseMs: 10_000, concorrencia: 10 },
  relatorios: { tentativas: 3, atrasoBaseMs: 30_000, concorrencia: 2 },
  integracoes: { tentativas: 6, atrasoBaseMs: 10_000, concorrencia: 5 },
  manutencao: { tentativas: 3, atrasoBaseMs: 60_000, concorrencia: 1 },
} as const;

export type NomeFila = keyof typeof FILAS;
export const NOMES_FILAS = Object.keys(FILAS) as NomeFila[];

/** Fila de mensagens mortas de cada fila: jobs que esgotaram as tentativas ou são inválidos. */
export function filaDlq(fila: NomeFila): string {
  return `${fila}-dlq`;
}

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
