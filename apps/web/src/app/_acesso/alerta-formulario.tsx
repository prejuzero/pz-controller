'use client';

import { CircleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

import { erroDeAcesso, type ChaveErroAcesso } from '../../formularios';

/**
 * Erro do envio de um formulário de acesso. Recebe o foco ao aparecer e é anunciado por leitores
 * de tela (role="alert"): nada falha em silêncio (CLAUDE.md, seção 2).
 */
export function AlertaFormulario({
  erro,
  seNaoAutorizado,
}: {
  erro: unknown;
  /** Texto do 401 nesta tela (ex.: senha errada, código errado, link expirado). */
  seNaoAutorizado: ChaveErroAcesso;
}) {
  const t = useTranslations('acesso.erros');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (erro !== null && erro !== undefined) ref.current?.focus();
  }, [erro]);
  if (erro === null || erro === undefined) return null;

  const falha = erroDeAcesso(erro, seNaoAutorizado);
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="flex gap-2 rounded-md border border-perigo p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-foco"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-perigo" aria-hidden />
      {'chave' in falha ? (
        <p>{t(falha.chave)}</p>
      ) : (
        <div>
          <p className="font-medium">{falha.titulo}</p>
          <p>{falha.descricao}</p>
        </div>
      )}
    </div>
  );
}
