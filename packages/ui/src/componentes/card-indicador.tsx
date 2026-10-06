import { cn } from '../utilitarios.js';

import type { ReactNode } from 'react';

export interface CardIndicadorProps {
  titulo: string;
  valor: ReactNode;
  /** Contexto do número (ex.: "nos próximos 5 dias úteis"). */
  descricao?: ReactNode;
  icone?: ReactNode;
  className?: string | undefined;
}

/** Card de indicador do painel (ex.: prazos a vencer). */
export function CardIndicador({ titulo, valor, descricao, icone, className }: CardIndicadorProps) {
  return (
    <section
      className={cn(
        'grid gap-2 rounded-lg border border-borda bg-superficie-elevada p-4 shadow-sm',
        className,
      )}
      aria-label={titulo}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-texto-suave">{titulo}</h3>
        {icone === undefined ? null : (
          <span className="text-texto-suave [&_svg]:size-4" aria-hidden>
            {icone}
          </span>
        )}
      </div>
      <p className="text-3xl font-semibold text-texto">{valor}</p>
      {descricao === undefined ? null : <p className="text-xs text-texto-suave">{descricao}</p>}
    </section>
  );
}
