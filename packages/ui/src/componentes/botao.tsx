'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import { Slot } from 'radix-ui';

import { mensagens } from '../mensagens.js';
import { cn } from '../utilitarios.js';

import type { ComponentProps } from 'react';

export const variantesBotao = cva(
  'inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variante: {
        primaria: 'bg-primaria text-primaria-texto hover:opacity-90',
        secundaria:
          'border border-borda-forte bg-superficie-elevada text-texto hover:bg-superficie',
        perigo: 'bg-perigo text-perigo-texto hover:opacity-90',
        fantasma: 'text-texto hover:bg-superficie',
      },
      tamanho: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        icone: 'size-10',
      },
    },
    defaultVariants: { variante: 'primaria', tamanho: 'md' },
  },
);

export interface BotaoProps extends ComponentProps<'button'>, VariantProps<typeof variantesBotao> {
  /** Renderiza o filho (ex.: um link) com a aparência de botão. */
  asChild?: boolean;
  /** Desabilita e mostra o indicador de progresso; leitores de tela recebem aria-busy. */
  carregando?: boolean;
}

export function Botao({
  className,
  variante,
  tamanho,
  asChild = false,
  carregando = false,
  disabled,
  children,
  ...props
}: BotaoProps) {
  const classes = cn(variantesBotao({ variante, tamanho }), className);
  if (asChild) {
    // O Slot exige um único filho (ex.: <a>), que recebe as classes e as props do botão.
    return (
      <Slot.Root className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      className={classes}
      disabled={disabled === true || carregando}
      aria-busy={carregando || undefined}
      {...props}
    >
      {carregando ? (
        <>
          <LoaderCircle className="animate-spin" aria-hidden />
          <span className="sr-only">{mensagens.carregando}</span>
        </>
      ) : null}
      {children}
    </button>
  );
}
