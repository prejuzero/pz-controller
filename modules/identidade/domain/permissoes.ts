/**
 * Catálogo de permissões (HU07): fonte única em código. Perfis (banco) só combinam estas
 * permissões; rotas declaram as que exigem (`@RequerPermissao`); o mesmo nome é o escopo OAuth
 * de app, MCP e integradores (ADR-015) e a permissão das ferramentas de IA (ADR-016).
 * Permissão nova entra aqui primeiro; `leitura` marca as que nunca alteram estado.
 */
export const CATALOGO_DE_PERMISSOES = {
  'conta:gerir': {
    descricao: 'Gerir a própria conta: dispositivos, tokens e acessos.',
    leitura: false,
  },
  'prazos:ler': { descricao: 'Consultar prazos e a memória de cálculo.', leitura: true },
  'prazos:confirmar': { descricao: 'Confirmar prazos sugeridos.', leitura: false },
  'prazos:ajustar': { descricao: 'Ajustar a data de um prazo, com justificativa.', leitura: false },
  'processos:ler': { descricao: 'Consultar processos e clientes.', leitura: true },
  'processos:gerir': {
    descricao: 'Cadastrar processos e clientes e marcar sigilo e cobertura.',
    leitura: false,
  },
  'publicacoes:ler': { descricao: 'Consultar publicações e intimações.', leitura: true },
  'calendario:ler': { descricao: 'Consultar o calendário forense.', leitura: true },
  'calendario:gerir': { descricao: 'Informar feriados locais e suspensões.', leitura: false },
  'relatorios:exportar': { descricao: 'Exportar relatórios.', leitura: false },
  'usuarios:gerir': {
    descricao: 'Convidar usuários do escritório e atribuir perfis.',
    leitura: false,
  },
  'admin:tenants': { descricao: 'Administrar tenants da plataforma.', leitura: false },
  'admin:impersonar': { descricao: 'Acessar um tenant por impersonação auditada.', leitura: false },
  'admin:filas': { descricao: 'Acompanhar filas e reprocessar a DLQ.', leitura: false },
  'curadoria:calendario': {
    descricao: 'Propor, aprovar e revogar o calendário forense global (curador).',
    leitura: false,
  },
  'escritorio:exportar': {
    descricao: 'Exportar todos os dados do escritório (LGPD; responsável pelo escritório).',
    leitura: false,
  },
  'escritorio:encerrar': {
    descricao: 'Pedir ou cancelar o encerramento da conta do escritório (LGPD; responsável).',
    leitura: false,
  },
  'curadoria:tabela-prazos': {
    descricao: 'Manter a taxonomia de atos e propor e aprovar a tabela de prazos (curador).',
    leitura: false,
  },
  'curadoria:classificacao': {
    descricao: 'Acompanhar a fila de revisão manual da classificação de publicações (curador).',
    leitura: false,
  },
} as const satisfies Record<string, { readonly descricao: string; readonly leitura: boolean }>;

export type Permissao = keyof typeof CATALOGO_DE_PERMISSOES;

export const PERMISSOES = Object.keys(CATALOGO_DE_PERMISSOES) as readonly Permissao[];

export function ehPermissao(valor: string): valor is Permissao {
  return Object.hasOwn(CATALOGO_DE_PERMISSOES, valor);
}

export function escoposOAuth(): { readonly escopo: Permissao; readonly descricao: string }[] {
  return PERMISSOES.map((escopo) => ({
    escopo,
    descricao: CATALOGO_DE_PERMISSOES[escopo].descricao,
  }));
}

export function somenteLeitura(permissoes: Iterable<Permissao>): Permissao[] {
  return [...permissoes].filter((p) => CATALOGO_DE_PERMISSOES[p].leitura);
}

/** Todas as exigidas presentes; lista vazia não concede nada (rota sem declaração nega). */
export function concede(tem: ReadonlySet<string>, exigidas: readonly Permissao[]): boolean {
  return exigidas.length > 0 && exigidas.every((p) => tem.has(p));
}
