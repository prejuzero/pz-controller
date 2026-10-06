'use client';

import { EstadoErro } from '@pz/ui';
import { captureException } from '@sentry/browser';
import { useEffect } from 'react';

import mensagens from '../mensagens/pt-BR.json';

import './globals.css';

// Falha no próprio layout raiz: sem o provedor de mensagens, o catálogo é lido direto.
export default function ErroGlobal({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    captureException(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body>
        <main className="mx-auto max-w-xl p-6">
          <EstadoErro
            titulo={mensagens.erros.inesperado}
            descricao={mensagens.erros.inesperadoDescricao}
            aoTentarNovamente={reset}
          />
        </main>
      </body>
    </html>
  );
}
