'use client';

import { EstadoErro, EstadoSemPermissao } from '@pz/ui';
import { captureException } from '@sentry/browser';
import { useEffect } from 'react';

import { descreverErro, ErroApi } from '../api/erros';

export default function PaginaDeErro({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    captureException(error);
  }, [error]);

  if (error instanceof ErroApi && error.status === 403) return <EstadoSemPermissao />;
  const { titulo, descricao } = descreverErro(error);
  return (
    <main className="mx-auto max-w-xl p-6">
      <EstadoErro titulo={titulo} descricao={descricao} aoTentarNovamente={reset} />
    </main>
  );
}
