'use client';

import { usePermissao } from '../../../api/hooks';

import type { Exigencia } from '../../../permissoes';
import type { ReactNode } from 'react';

interface Props {
  permissao: Exigencia;
  children: ReactNode;
  /** Mostrada sem a permissão (ex.: <AcessoNegado />); por padrão a ação só some. */
  alternativa?: ReactNode;
}

/**
 * Mostra o conteúdo só com a permissão (HU07). É conveniência visual: a rota correspondente na API
 * exige a mesma permissão por `@RequerPermissao`. Enquanto a sessão carrega, não mostra nada.
 */
export function SePermitido({ permissao, children, alternativa = null }: Props) {
  const permitido = usePermissao(permissao);
  if (permitido === undefined) return null;
  return permitido ? children : alternativa;
}
