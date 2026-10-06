// Catálogo de textos padrão dos componentes (CLAUDE.md, seção 8: nada de string solta em
// componente). O portal pode sobrescrever cada texto pelas props do componente.
export const mensagens = {
  fechar: 'Fechar',
  carregando: 'Carregando…',
  selecione: 'Selecione',
  selecioneData: 'Selecione uma data',
  remover: (rotulo: string) => `Remover ${rotulo}`,
  campoObrigatorio: 'obrigatório',
  tabela: {
    semResultados: 'Nenhum resultado encontrado.',
    paginaAnterior: 'Página anterior',
    proximaPagina: 'Próxima página',
    pagina: (atual: number, total: number) => `Página ${String(atual)} de ${String(total)}`,
  },
  estados: {
    vazioTitulo: 'Nada por aqui ainda',
    erroTitulo: 'Não foi possível carregar',
    erroDescricao: 'Tente novamente. Se o problema continuar, fale com o suporte.',
    tentarNovamente: 'Tentar novamente',
    semPermissaoTitulo: 'Acesso restrito',
    semPermissaoDescricao:
      'Seu perfil não tem permissão para ver este conteúdo. Fale com o administrador do escritório.',
  },
  sugeridoPorIa: 'Sugerido por IA',
} as const;
