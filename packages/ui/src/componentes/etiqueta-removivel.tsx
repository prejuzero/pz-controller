import { X } from 'lucide-react';

import { mensagens } from '../mensagens.js';

export interface EtiquetaRemovivelProps {
  rotulo: string;
  aoRemover: () => void;
  /** Nome acessível do botão de remoção (padrão: "Remover {rótulo}"). */
  rotuloRemover?: string | undefined;
}

/** Etiqueta com botão de remoção (ex.: filtros ativos). */
export function EtiquetaRemovivel({ rotulo, aoRemover, rotuloRemover }: EtiquetaRemovivelProps) {
  return (
    <span className="inline-flex items-center gap-1 rounded-total bg-primaria-suave py-0.5 pr-1 pl-2.5 text-xs font-medium text-texto">
      {rotulo}
      <button
        type="button"
        onClick={aoRemover}
        aria-label={rotuloRemover ?? mensagens.remover(rotulo)}
        className="inline-flex size-5 items-center justify-center rounded-total hover:bg-fundo"
      >
        <X className="size-3" aria-hidden />
      </button>
    </span>
  );
}
