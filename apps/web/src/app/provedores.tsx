'use client';

import { Avisos, avisar } from '@pz/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { criarCache } from '../api/cache';
import { criarCliente } from '../api/cliente';
import { ContextoApi } from '../api/hooks';
import { urlEntrar } from '../rotas';

export function Provedores({ children }: { children: ReactNode }) {
  const [api] = useState(() => criarCliente());
  const [cache] = useState(() =>
    criarCache({
      avisarErro: ({ titulo, descricao }) => avisar.erro(titulo, descricao),
      // Navegação completa: descarta o estado da sessão anterior; o aviso aparece em /entrar.
      sessaoExpirada: () => {
        const { pathname, search } = window.location;
        window.location.assign(urlEntrar(pathname + search, 'sessao-expirada'));
      },
    }),
  );
  return (
    <ContextoApi value={api}>
      <QueryClientProvider client={cache}>
        {children}
        <Avisos />
      </QueryClientProvider>
    </ContextoApi>
  );
}
