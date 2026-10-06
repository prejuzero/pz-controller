import { Proibido } from './erros.js';
import { err, ok } from './result.js';

import type { Result } from './result.js';
import type { Uuid } from './uuid.js';

/**
 * Quem age (HU07), montado pela API a partir da sessão: os módulos recebem o ator pronto e
 * nunca leem a sessão. As permissões vêm do catálogo do módulo identidade.
 */
export interface Ator {
  readonly usuarioId: Uuid;
  readonly tenantId: Uuid;
  readonly permissoes: ReadonlySet<string>;
  /** Quem de fato agiu, quando diferente (administrador da plataforma em impersonação). */
  readonly usuarioRealId?: Uuid;
}

/**
 * Regra de acesso por recurso de um módulo (ex.: só o responsável do prazo), além da permissão
 * exigida na rota. Fica no domínio do módulo dono do recurso.
 */
export interface Politica<Recurso> {
  permite(ator: Ator, recurso: Recurso): boolean;
}

export function temPermissao(ator: Ator, permissao: string): boolean {
  return ator.permissoes.has(permissao);
}

export function autorizar<Recurso>(
  politica: Politica<Recurso>,
  ator: Ator,
  recurso: Recurso,
): Result<void, Proibido> {
  return politica.permite(ator, recurso)
    ? ok(undefined)
    : err(new Proibido('acesso-negado', 'Você não tem permissão para esta operação.'));
}
