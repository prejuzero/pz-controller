import { mensagens } from '../mensagens.js';
import { cn } from '../utilitarios.js';

export interface EsqueletoProps {
  className?: string | undefined;
}

/** Bloco de carregamento. Use dentro de um `EstadoCarregando` para anunciar a espera. */
export function Esqueleto({ className }: EsqueletoProps) {
  return (
    <div
      className={cn('h-4 animate-pulse rounded-md bg-borda motion-reduce:animate-none', className)}
      aria-hidden
    />
  );
}

export interface EstadoCarregandoProps {
  /** Texto para leitores de tela (padrão: "Carregando…"). */
  rotulo?: string | undefined;
  linhas?: number | undefined;
}

/** Estado "carregando": esqueletos visíveis e anúncio único para leitores de tela. */
export function EstadoCarregando({
  rotulo = mensagens.carregando,
  linhas = 3,
}: EstadoCarregandoProps) {
  return (
    <div role="status" aria-live="polite" className="grid gap-2">
      <span className="sr-only">{rotulo}</span>
      {Array.from({ length: linhas }, (_, i) => (
        <Esqueleto key={i} className={i === linhas - 1 ? 'w-2/3' : 'w-full'} />
      ))}
    </div>
  );
}
