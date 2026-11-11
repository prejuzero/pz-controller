import mensagens from './pt-BR.json';

type Catalogo = typeof mensagens;

/** Chaves do catálogo pt-BR no formato "grupo.chave" (CLAUDE.md, seção 8: nada de string solta). */
export type ChaveDeMensagem = {
  [G in keyof Catalogo]: `${G}.${Extract<keyof Catalogo[G], string>}`;
}[keyof Catalogo];

/** Texto do catálogo; chave sem texto é erro de programação (o tipo já impede). */
export function t(chave: ChaveDeMensagem): string {
  const valor = chave
    .split('.')
    .reduce<unknown>((no, parte) => (no as Record<string, unknown>)[parte], mensagens);
  if (typeof valor !== 'string') throw new Error(`mensagem ausente: ${chave}`);
  return valor;
}
