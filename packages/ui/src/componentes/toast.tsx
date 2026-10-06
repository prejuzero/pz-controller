'use client';

import { toast as sonner, Toaster } from 'sonner';

import { mensagens } from '../mensagens.js';

/** Região dos avisos; montar uma vez no layout. Avisos são anunciados por leitores de tela. */
export function Avisos() {
  return (
    <Toaster
      position="bottom-right"
      closeButton
      toastOptions={{
        unstyled: true,
        closeButtonAriaLabel: mensagens.fechar,
        classNames: {
          toast:
            'flex w-full items-start gap-3 rounded-md border border-borda bg-superficie-elevada p-4 text-sm text-texto shadow-lg',
          title: 'font-medium',
          description: 'text-texto-suave',
          closeButton: 'order-last rounded-sm text-texto-suave hover:text-texto',
          success: 'border-l-4 border-l-sucesso',
          error: 'border-l-4 border-l-perigo',
          warning: 'border-l-4 border-l-alerta',
          info: 'border-l-4 border-l-info',
        },
      }}
    />
  );
}

/** Exibe um aviso. Erros ficam até serem fechados: nada falha em silêncio (CLAUDE.md, §2). */
export const avisar = {
  sucesso: (titulo: string, descricao?: string) =>
    sonner.success(titulo, { description: descricao }),
  info: (titulo: string, descricao?: string) => sonner.info(titulo, { description: descricao }),
  alerta: (titulo: string, descricao?: string) =>
    sonner.warning(titulo, { description: descricao }),
  erro: (titulo: string, descricao?: string) =>
    sonner.error(titulo, { description: descricao, duration: Number.POSITIVE_INFINITY }),
  /** Fecha todos os avisos (ex.: ao sair da sessão). */
  dispensarTodos: () => sonner.dismiss(),
};
