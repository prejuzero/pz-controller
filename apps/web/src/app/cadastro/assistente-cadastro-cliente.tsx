'use client';

import dynamic from 'next/dynamic';

/** O progresso vem do sessionStorage, que só existe no navegador: sem renderização no servidor. */
export const AssistenteCadastroCliente = dynamic(
  () => import('./assistente-cadastro').then((m) => m.AssistenteCadastro),
  { ssr: false },
);
