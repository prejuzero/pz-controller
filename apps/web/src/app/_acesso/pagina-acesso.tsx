import type { ReactNode } from 'react';

/** Moldura das telas de acesso (sem a casca autenticada): cartão central, utilizável em 360 px. */
export function PaginaAcesso({
  titulo,
  descricao,
  children,
}: {
  titulo: ReactNode;
  descricao?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-start justify-center bg-fundo px-4 py-10 text-texto sm:items-center">
      <div className="w-full max-w-sm space-y-5 rounded-lg border border-borda bg-superficie p-5 sm:p-6">
        <div className="space-y-1.5">
          <h1 id="titulo-acesso" tabIndex={-1} className="text-2xl font-semibold outline-none">
            {titulo}
          </h1>
          {descricao === undefined ? null : <p className="text-sm text-texto-suave">{descricao}</p>}
        </div>
        {children}
      </div>
    </main>
  );
}
