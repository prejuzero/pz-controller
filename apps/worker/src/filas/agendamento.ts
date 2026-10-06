import { z } from 'zod';

import { definirJob } from './job.js';

import type { DefinicaoJob } from './job.js';

/** Fuso dos jobs recorrentes: "todo dia às 3h" é 3h de Brasília, com ou sem horário de verão. */
export const FUSO_DO_AGENDADOR = 'America/Sao_Paulo';

/**
 * Job recorrente declarado em código (HU10). Global por natureza (atravessa tenants), com
 * motivo explícito; o que for por tenant, o tratador distribui em jobs de tenant.
 */
export interface Agendamento<Dados> {
  /** ID estável do agendador no Redis: o mesmo ID em todas as réplicas garante execução única. */
  readonly id: string;
  readonly job: DefinicaoJob<Dados>;
  /** Cron (5 campos, ou 6 com segundos) no fuso do agendador. */
  readonly cron: string;
  readonly dados: Dados;
  readonly motivo: string;
}

export function definirAgendamento<Dados>(agendamento: Agendamento<Dados>): Agendamento<Dados> {
  if (!/^[a-z][a-z0-9.-]*$/.test(agendamento.id)) {
    throw new Error(`ID de agendamento deve ser minúsculo, com . ou -: "${agendamento.id}"`);
  }
  if (!agendamento.job.global) {
    throw new Error(
      `O agendamento ${agendamento.id} exige um job global (${agendamento.job.tipo}).`,
    );
  }
  return agendamento;
}

/** Retenção do outbox: eventos publicados e registros de deduplicação (HU04/HU10). */
export const RETENCAO_DO_OUTBOX_MS = 30 * 24 * 3600 * 1000;

export const limparOutboxJob = definirJob({
  fila: 'manutencao',
  tipo: 'manutencao.limpar-outbox',
  dados: z.object({}).strict(),
  global: true,
});

export const verificarAuditoriaJob = definirJob({
  fila: 'manutencao',
  tipo: 'manutencao.verificar-auditoria',
  dados: z.object({}).strict(),
  global: true,
});

/** Catálogo dos jobs recorrentes. Remover daqui remove o agendador no próximo boot. */
export const AGENDAMENTOS: readonly Agendamento<unknown>[] = [
  definirAgendamento({
    id: 'manutencao.limpar-outbox',
    job: limparOutboxJob,
    cron: '0 3 * * *', // diário às 3h, fora do horário de expediente
    dados: {},
    motivo: 'limpeza diária do outbox (retenção de 30 dias)',
  }),
  definirAgendamento({
    id: 'manutencao.verificar-auditoria',
    job: verificarAuditoriaJob,
    cron: '0 2 * * *', // diário às 2h: verifica a cadeia e exporta para o WORM (HU08)
    dados: {},
    motivo: 'verificação diária da trilha de auditoria e cópia WORM',
  }),
] as readonly Agendamento<unknown>[];
