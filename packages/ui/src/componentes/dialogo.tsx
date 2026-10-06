import { X } from 'lucide-react';
import { Dialog } from 'radix-ui';

import { mensagens } from '../mensagens.js';

import type { ReactNode } from 'react';

export interface DialogoProps {
  aberto?: boolean | undefined;
  aoMudarAberto?: ((aberto: boolean) => void) | undefined;
  /** Elemento que abre o diálogo (ex.: um Botao). */
  gatilho?: ReactNode;
  titulo: ReactNode;
  descricao?: ReactNode;
  /** Ações no rodapé (ex.: Cancelar e Confirmar). */
  acoes?: ReactNode;
  children?: ReactNode;
}

/** Diálogo modal: prende o foco, fecha com Esc e devolve o foco ao gatilho (Radix Dialog). */
export function Dialogo({
  aberto,
  aoMudarAberto,
  gatilho,
  titulo,
  descricao,
  acoes,
  children,
}: DialogoProps) {
  return (
    <Dialog.Root
      {...(aberto === undefined ? {} : { open: aberto })}
      {...(aoMudarAberto === undefined ? {} : { onOpenChange: aoMudarAberto })}
    >
      {gatilho === undefined ? null : <Dialog.Trigger asChild>{gatilho}</Dialog.Trigger>}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-borda bg-superficie-elevada p-6 text-texto shadow-lg"
          {...(descricao === undefined ? { 'aria-describedby': undefined } : {})}
        >
          <div className="grid gap-1.5 pr-8">
            <Dialog.Title className="text-lg font-semibold">{titulo}</Dialog.Title>
            {descricao === undefined ? null : (
              <Dialog.Description className="text-sm text-texto-suave">
                {descricao}
              </Dialog.Description>
            )}
          </div>
          {children}
          {acoes === undefined ? null : (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{acoes}</div>
          )}
          <Dialog.Close
            className="absolute top-4 right-4 rounded-sm text-texto-suave hover:text-texto"
            aria-label={mensagens.fechar}
          >
            <X className="size-4" aria-hidden />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Fecha o diálogo ao ser acionado (envolve um Botao de ação). */
export const FecharDialogo = Dialog.Close;
