'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useId, useState, type ComponentProps, type ReactNode } from 'react';

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

/**
 * Campo de texto com rótulo, ajuda e erro acessíveis. Com `type="password"`, um botão de olho
 * mostra ou oculta o que foi digitado; começa sempre oculto.
 */
export function Campo({ rotulo, ajuda, erro, obrigatorio, className, ...props }: CampoProps) {
  const senha = props.type === 'password';
  const [visivel, setVisivel] = useState(false);
  return (
    <EnvoltorioCampo
      rotulo={rotulo}
      ajuda={ajuda}
      erro={erro}
      obrigatorio={obrigatorio ?? false}
      className={className}
    >
      {({ id, descricao, invalido }) => {
        const entrada = (
          <input
            id={id}
            className={cn(classesEntrada, senha && 'pr-10')}
            aria-describedby={descricao}
            aria-invalid={invalido || undefined}
            required={obrigatorio}
            {...props}
            type={senha && visivel ? 'text' : props.type}
          />
        );
        if (!senha) return entrada;
        return (
          <div className="relative">
            {entrada}
            <button
              type="button"
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-texto-suave hover:text-texto focus-visible:ring-2 focus-visible:ring-foco focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={visivel ? mensagens.ocultarSenha : mensagens.mostrarSenha}
              aria-pressed={visivel}
              aria-controls={id}
              disabled={props.disabled}
              onClick={() => {
                setVisivel((v) => !v);
              }}
            >
              {visivel ? (
                <EyeOff className="size-4" aria-hidden />
              ) : (
                <Eye className="size-4" aria-hidden />
              )}
            </button>
          </div>
        );
      }}
    </EnvoltorioCampo>
  );
}
