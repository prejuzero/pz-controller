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
    preferencias: () => [...chaves.notificacoes.todas, 'preferencias'] as const,
    envios: () => [...chaves.notificacoes.todas, 'envios'] as const,
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
    /** Conferências de painel (HU36): invalidadas junto com os processos (mesmo prefixo). */
    conferencias: () => [...chaves.processos.todas, 'conferencias'] as const,
    importacao: (id: string) => [...chaves.processos.todas, 'importacao', id] as const,
  },
  /** Nomes do escritório monitorados na captura (HU42). */
  nomesMonitorados: ['nomesMonitorados'] as const,
  tabelaPrazos: {
    todas: ['tabelaPrazos'] as const,
    tipos: () => [...chaves.tabelaPrazos.todas, 'tipos'] as const,
    versoes: () => [...chaves.tabelaPrazos.todas, 'versoes'] as const,
  },
  relatorios: {
    todas: ['relatorios'] as const,
    lista: () => [...chaves.relatorios.todas, 'lista'] as const,
  },
  privacidade: {
    todas: ['privacidade'] as const,
    vigentes: () => [...chaves.privacidade.todas, 'vigentes'] as const,
    pendentes: () => [...chaves.privacidade.todas, 'pendentes'] as const,
    aceites: () => [...chaves.privacidade.todas, 'aceites'] as const,
    exportacao: (id: string) => [...chaves.privacidade.todas, 'exportacao', id] as const,
    encerramento: () => [...chaves.privacidade.todas, 'encerramento'] as const,
    versoes: () => [...chaves.privacidade.todas, 'versoes'] as const,
  },
  admin: {
    todas: ['admin'] as const,
    tenants: () => [...chaves.admin.todas, 'tenants'] as const,
    integracoes: () => [...chaves.admin.todas, 'integracoes'] as const,
    filas: () => [...chaves.admin.todas, 'filas'] as const,
    rejeicoes: () => [...chaves.admin.todas, 'rejeicoes'] as const,
  },
  captura: {
    todas: ['captura'] as const,
    status: () => [...chaves.captura.todas, 'status'] as const,
  },
  prazos: {
    todas: ['prazos'] as const,
    lista: (filtros: object) => [...chaves.prazos.todas, 'lista', filtros] as const,
    detalhe: (id: string) => [...chaves.prazos.todas, 'detalhe', id] as const,
    responsaveis: () => [...chaves.prazos.todas, 'responsaveis'] as const,
  },
  /** Indicadores dos prazos: invalidados junto com `prazos.todas` (mesmo prefixo). */
  dashboard: {
    resumo: (filtro: object) => [...chaves.prazos.todas, 'dashboard', 'resumo', filtro] as const,
    linhaDoTempo: (filtro: object) =>
      [...chaves.prazos.todas, 'dashboard', 'linha-do-tempo', filtro] as const,
    proximos: (filtro: object) =>
      [...chaves.prazos.todas, 'dashboard', 'proximos', filtro] as const,
    /** Calendário (HU27): mesmo prefixo, invalidado quando um prazo muda. */
    agenda: (consulta: object) => [...chaves.prazos.todas, 'agenda', consulta] as const,
  },
  busca: {
    todas: ['busca'] as const,
    resultado: (recurso: string, filtros: object) =>
      [...chaves.busca.todas, recurso, filtros] as const,
    rapida: (texto: string) => [...chaves.busca.todas, 'rapida', texto] as const,
  },
  publicacoes: {
    todas: ['publicacoes'] as const,
    lista: (filtros: object) => [...chaves.publicacoes.todas, 'lista', filtros] as const,
    detalhe: (id: string) => [...chaves.publicacoes.todas, 'detalhe', id] as const,
    resumo: (id: string) => [...chaves.publicacoes.todas, 'resumo', id] as const,
  },
  equipe: ['equipe'] as const,
  clientes: {
    todas: ['clientes'] as const,
    lista: () => [...chaves.clientes.todas, 'lista'] as const,
  },
  integracoes: {
    todas: ['integracoes'] as const,
    escopos: () => [...chaves.integracoes.todas, 'escopos'] as const,
    clientes: () => [...chaves.integracoes.todas, 'clientes'] as const,
    eventos: () => [...chaves.integracoes.todas, 'eventos'] as const,
    webhooks: () => [...chaves.integracoes.todas, 'webhooks'] as const,
    entregas: () => [...chaves.integracoes.todas, 'entregas'] as const,
    autorizacao: (pedido: object) => [...chaves.integracoes.todas, 'autorizacao', pedido] as const,
  },
  membros: {
    todas: ['membros'] as const,
    lista: () => [...chaves.membros.todas, 'lista'] as const,
  },
};
