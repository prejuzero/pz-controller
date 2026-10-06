import type { Instant, Uuid } from '@pz/kernel';

/** Sessão expira após 12 h sem uso (deslizante) ou 7 dias após o login (absoluto). */
export const INATIVIDADE_MAXIMA_MS = 12 * 3600 * 1000;
export const DURACAO_MAXIMA_MS = 7 * 24 * 3600 * 1000;

/**
 * Acesso do administrador da plataforma a um tenant (HU07, ADR-003), guardado na própria sessão:
 * o tenant de origem não muda; o efetivo da requisição passa a ser o acessado, só para leitura.
 */
export interface Impersonacao {
  readonly id: Uuid;
  readonly tenantId: Uuid;
  readonly motivo: string;
  readonly iniciadaEm: Instant;
  readonly expiraEm: Instant;
}

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
  /** Administrador da plataforma acessando outro tenant (HU07); some ao vencer. */
  readonly impersonacao?: Impersonacao;
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

/** Renova o uso; a impersonação vencida cai aqui (todo uso passa por ValidarSessao). */
export function registrarUso(sessao: Sessao, agora: Instant): Sessao {
  const { impersonacao, ...resto } = sessao;
  const vigente = impersonacao !== undefined && agora.ehAntesDe(impersonacao.expiraEm);
  return { ...resto, ...(vigente ? { impersonacao } : {}), ultimoUso: agora };
}
