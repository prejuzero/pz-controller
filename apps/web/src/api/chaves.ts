/**
 * Chaves de cache do TanStack Query, padronizadas por recurso: `[recurso, ...escopo]`. Invalidar
 * `chaves.<recurso>.todas` invalida todas as consultas daquele recurso após uma mutação.
 */
export const chaves = {
  sessao: {
    todas: ['sessao'] as const,
    atual: () => [...chaves.sessao.todas, 'atual'] as const,
  },
};
