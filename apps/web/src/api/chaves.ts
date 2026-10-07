/**
 * Chaves de cache do TanStack Query, padronizadas por recurso: `[recurso, ...escopo]`. Invalidar
 * `chaves.<recurso>.todas` invalida todas as consultas daquele recurso após uma mutação.
 */
export const chaves = {
  sessao: {
    todas: ['sessao'] as const,
    atual: () => [...chaves.sessao.todas, 'atual'] as const,
    acessos: () => [...chaves.sessao.todas, 'acessos'] as const,
    dispositivos: () => [...chaves.sessao.todas, 'dispositivos'] as const,
  },
  cadastro: {
    todas: ['cadastro'] as const,
    perfil: () => [...chaves.cadastro.todas, 'perfil'] as const,
  },
  notificacoes: {
    todas: ['notificacoes'] as const,
    avisos: () => [...chaves.notificacoes.todas, 'avisos'] as const,
  },
  calendario: {
    todas: ['calendario'] as const,
    global: (ano: number) => [...chaves.calendario.todas, 'global', ano] as const,
    locais: (ano: number) => [...chaves.calendario.todas, 'locais', ano] as const,
  },
  processos: {
    todas: ['processos'] as const,
    lista: (filtros: object) => [...chaves.processos.todas, 'lista', filtros] as const,
    detalhe: (id: string) => [...chaves.processos.todas, 'detalhe', id] as const,
  },
  tabelaPrazos: {
    todas: ['tabelaPrazos'] as const,
    tipos: () => [...chaves.tabelaPrazos.todas, 'tipos'] as const,
    versoes: () => [...chaves.tabelaPrazos.todas, 'versoes'] as const,
  },
  clientes: {
    todas: ['clientes'] as const,
    lista: () => [...chaves.clientes.todas, 'lista'] as const,
  },
};
