import type { Instant, Uuid } from '@pz/kernel';

/** Carência entre o pedido e a exclusão (decisão do produto, 07/10/2026). */
export const CARENCIA_DO_ENCERRAMENTO_DIAS = 30;
const DIA_MS = 24 * 3_600_000;

export interface Encerramento {
  readonly solicitadoPor: Uuid;
  readonly solicitadoEm: Instant;
  readonly efetivarEm: Instant;
  readonly canceladoEm?: Instant;
  readonly efetivadoEm?: Instant;
}

export type SituacaoDoEncerramento = 'em-carencia' | 'vencido' | 'cancelado' | 'efetivado';

export function novoEncerramento(solicitadoPor: Uuid, agora: Instant): Encerramento {
  return {
    solicitadoPor,
    solicitadoEm: agora,
    efetivarEm: agora.maisMs(CARENCIA_DO_ENCERRAMENTO_DIAS * DIA_MS),
  };
}

export function situacaoDoEncerramento(e: Encerramento, agora: Instant): SituacaoDoEncerramento {
  if (e.efetivadoEm !== undefined) return 'efetivado';
  if (e.canceladoEm !== undefined) return 'cancelado';
  return agora.ehAntesDe(e.efetivarEm) ? 'em-carencia' : 'vencido';
}
