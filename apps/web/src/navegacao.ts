import type { Exigencia } from './permissoes';

/**
 * Menu do portal na ordem da especificação (seção 2.12). `permissao` é a de leitura exigida pela
 * API da seção (HU07); seções sem permissão de leitura no catálogo ficam sempre visíveis.
 */
export const ITENS_MENU = [
  { chave: 'dashboard', href: '/' },
  { chave: 'prazos', href: '/prazos', permissao: 'prazos:ler' },
  { chave: 'publicacoes', href: '/publicacoes', permissao: 'publicacoes:ler' },
  { chave: 'busca', href: '/busca' },
  { chave: 'processos', href: '/processos', permissao: 'processos:ler' },
  // O escritório consulta (e informa feriados locais); a curadoria mantém o calendário global (HU13).
  {
    chave: 'calendario',
    href: '/calendario',
    permissao: { algum: ['calendario:ler', 'curadoria:calendario'] },
  },
  { chave: 'relatorios', href: '/relatorios' },
  { chave: 'configuracoes', href: '/configuracoes' },
] as const satisfies readonly { chave: string; href: string; permissao?: Exigencia }[];

export type ItemMenu = (typeof ITENS_MENU)[number];
export type ChaveMenu = ItemMenu['chave'];

/** No celular, a barra inferior mostra os itens de uso diário; o restante fica na gaveta "Mais". */
const CHAVES_BARRA_INFERIOR: readonly ChaveMenu[] = ['dashboard', 'prazos', 'publicacoes', 'busca'];
export const ITENS_BARRA_INFERIOR: readonly ItemMenu[] = ITENS_MENU.filter((item) =>
  CHAVES_BARRA_INFERIOR.includes(item.chave),
);

/** "/" só é ativo na própria raiz; as demais seções incluem as subpáginas. */
export function itemAtivo(caminho: string, href: string): boolean {
  if (href === '/') return caminho === '/';
  return caminho === href || caminho.startsWith(`${href}/`);
}

/** Seção do menu correspondente ao primeiro segmento da URL (ex.: "prazos"). */
export function secaoDoSegmento(segmento: string): ItemMenu | undefined {
  return ITENS_MENU.find((item) => item.href !== '/' && item.href === `/${segmento}`);
}
