import type { Formats } from 'next-intl';

/** Idioma padrão do portal; o catálogo em src/mensagens está pronto para outros idiomas. */
export const IDIOMA_PADRAO = 'pt-BR';

/** Fuso padrão de exibição (CLAUDE.md, seção 9). O fim de prazo usa o fuso do juízo, vindo da API. */
export const FUSO_PADRAO = 'America/Sao_Paulo';

export const formatos = {
  dateTime: {
    data: { day: '2-digit', month: '2-digit', year: 'numeric' },
    dataHora: {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    },
  },
} satisfies Formats;
