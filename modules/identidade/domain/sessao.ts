import type { Instant, Uuid } from '@pz/kernel';

/** Sessão expira após 12 h sem uso (deslizante) ou 7 dias após o login (absoluto). */
export const INATIVIDADE_MAXIMA_MS = 12 * 3600 * 1000;
export const DURACAO_MAXIMA_MS = 7 * 24 * 3600 * 1000;

/** `senha`: só passou a senha (falta o 2FA); `completo`: senha e 2FA verificados. */
export type NivelSessao = 'senha' | 'completo';

export interface Sessao {
  readonly id: Uuid;
  readonly usuarioId: Uuid;
  readonly tenantId: Uuid;
  readonly nivel: NivelSessao;
  /** O usuário já tem 2FA ativo (falta verificar) ou ainda precisa configurar. */
  readonly segundoFatorAtivo: boolean;
  readonly criadaEm: Instant;
  readonly ultimoUso: Instant;
  /** Token de acesso de um dispositivo (app, MCP, integrador): revogável com ele. */
  readonly dispositivoId?: Uuid;
  /** Limite absoluto próprio (token de acesso curto), além das regras gerais. */
  readonly expiraAte?: Instant;
}

export function expiracao(sessao: Sessao): Instant {
  const porInatividade = sessao.ultimoUso.maisMs(INATIVIDADE_MAXIMA_MS);
  const absoluta = sessao.criadaEm.maisMs(DURACAO_MAXIMA_MS);
  const geral = porInatividade.ehAntesDe(absoluta) ? porInatividade : absoluta;
  const { expiraAte } = sessao;
  return expiraAte?.ehAntesDe(geral) === true ? expiraAte : geral;
}

export function estaAtiva(sessao: Sessao, agora: Instant): boolean {
  return agora.ehAntesDe(expiracao(sessao));
}

export function registrarUso(sessao: Sessao, agora: Instant): Sessao {
  return { ...sessao, ultimoUso: agora };
}
