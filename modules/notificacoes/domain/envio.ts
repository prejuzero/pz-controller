import type { Instant, Uuid } from '@pz/kernel';

export type RecursoDoEnvio = 'prazo' | 'publicacao' | 'relatorio' | 'busca';
export type SituacaoDoEnvio = 'pendente' | 'enviado' | 'rejeitado' | 'falhou';

/** Envio manual por e-mail como o portal mostra a quem enviou (PZ-361). */
export interface EnvioRecente {
  readonly id: Uuid;
  readonly recurso: RecursoDoEnvio;
  readonly destinatarios: number;
  readonly situacao: SituacaoDoEnvio;
  /** Por que falhou (preparo) ou foi rejeitado (provedor); `null` nos demais. */
  readonly motivo: string | null;
  readonly criadoEm: Instant;
}

/** O que a situação precisa saber: a falha do preparo e o estado da notificação vinculada. */
export interface EstadoDoEnvio {
  readonly motivoFalha: string | null;
  readonly notificacao: {
    readonly enviadaEm: Instant | null;
    readonly rejeitadaEm: Instant | null;
    readonly motivoRejeicao: string | null;
  } | null;
}

/**
 * Situação do envio (PZ-361): falha do preparo vence; depois a rejeição do provedor; depois o
 * envio da notificação. Sem nada disso, ainda está na fila.
 */
export function situacaoDoEnvio(estado: EstadoDoEnvio): {
  situacao: SituacaoDoEnvio;
  motivo: string | null;
} {
  if (estado.motivoFalha !== null) return { situacao: 'falhou', motivo: estado.motivoFalha };
  const n = estado.notificacao;
  // Só a categoria (bounce, spam, falha): o detalhe do provedor pode trazer o endereço (LGPD).
  if (n?.rejeitadaEm !== null && n?.rejeitadaEm !== undefined)
    return { situacao: 'rejeitado', motivo: n.motivoRejeicao?.split(':')[0]?.trim() ?? null };
  if (n?.enviadaEm !== null && n?.enviadaEm !== undefined)
    return { situacao: 'enviado', motivo: null };
  return { situacao: 'pendente', motivo: null };
}
