'use client';

import { useId, type ComponentProps, type ReactNode } from 'react';

import { mensagens } from '../mensagens.js';
import { cn } from '../utilitarios.js';

export const classesEntrada =
  'h-10 w-full rounded-md border border-borda-forte bg-superficie-elevada px-3 text-sm text-texto placeholder:text-texto-suave disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-perigo';

export interface RotuloCampoProps {
  rotulo: ReactNode;
  /** Texto de apoio abaixo do campo. */
  ajuda?: ReactNode;
  /** Mensagem de erro; marca o campo como inválido e é anunciada por leitores de tela. */
  erro?: ReactNode;
  obrigatorio?: boolean;
}

/** Rótulo, ajuda e erro de um controle, com os ids de acessibilidade já ligados. */
export function EnvoltorioCampo({
  rotulo,
  ajuda,
  erro,
  obrigatorio = false,
  className,
  children,
}: RotuloCampoProps & {
  className?: string | undefined;
  children: (ids: { id: string; descricao: string | undefined; invalido: boolean }) => ReactNode;
}) {
  const id = useId();
  const idAjuda = ajuda === undefined ? undefined : `${id}-ajuda`;
  const idErro = erro === undefined ? undefined : `${id}-erro`;
  const descricao = [idErro, idAjuda].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('grid gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-texto">
        {rotulo}
        {obrigatorio ? (
          <span className="text-perigo">
            {' *'}
            <span className="sr-only">({mensagens.campoObrigatorio})</span>
          </span>
        ) : null}
      </label>
      {children({ id, descricao, invalido: erro !== undefined })}
      {ajuda === undefined ? null : (
        <p id={idAjuda} className="text-xs text-texto-suave">
          {ajuda}
        </p>
      )}
      {erro === undefined ? null : (
        <p id={idErro} role="alert" className="text-xs font-medium text-perigo">
          {erro}
        </p>
      )}
    </div>
  );
}

export type CampoProps = Omit<ComponentProps<'input'>, 'id'> & RotuloCampoProps;

/** Campo de texto com rótulo, ajuda e erro acessíveis. */
export function Campo({ rotulo, ajuda, erro, obrigatorio, className, ...props }: CampoProps) {
  return (
    <EnvoltorioCampo
      rotulo={rotulo}
      ajuda={ajuda}
      erro={erro}
      obrigatorio={obrigatorio ?? false}
      className={className}
    >
      {({ id, descricao, invalido }) => (
        <input
          id={id}
          className={classesEntrada}
          aria-describedby={descricao}
          aria-invalid={invalido || undefined}
          required={obrigatorio}
          {...props}
        />
      )}
    </EnvoltorioCampo>
  );
}
