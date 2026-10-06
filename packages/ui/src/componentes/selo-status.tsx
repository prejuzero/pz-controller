import { cva } from 'class-variance-authority';
import { Sparkles } from 'lucide-react';

import { cn } from '../utilitarios.js';

import type { ReactNode } from 'react';

const variantesSelo = cva(
  'inline-flex items-center gap-1 rounded-total px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      tom: {
        neutro: 'border border-borda-forte text-texto',
        info: 'bg-info text-info-texto',
        sucesso: 'bg-sucesso text-sucesso-texto',
        alerta: 'bg-alerta text-alerta-texto',
        perigo: 'bg-perigo text-perigo-texto',
        ia: 'bg-ia text-ia-texto',
      },
    },
  },
);

export type TomSelo = 'neutro' | 'info' | 'sucesso' | 'alerta' | 'perigo' | 'ia';

export interface SeloStatusProps {
  tom: TomSelo;
  children: ReactNode;
  className?: string | undefined;
}

/**
 * Selo de status (ex.: "A confirmar", "Confirmado", "Vencido"). A cor nunca é o único sinal: o
 * texto diz o status (WCAG 1.4.1). O tom `ia` marca sugestões da IA (ADR-016).
 */
export function SeloStatus({ tom, children, className }: SeloStatusProps) {
  return (
    <span className={cn(variantesSelo({ tom }), className)}>
      {tom === 'ia' ? <Sparkles className="size-3" aria-hidden /> : null}
      {children}
    </span>
  );
}
