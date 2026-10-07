'use client';

import dynamic from 'next/dynamic';

/** O token vem do fragmento da URL, que só existe no navegador: sem renderização no servidor. */
export const VerificacaoEmailCliente = dynamic(
  () => import('./verificacao-email').then((m) => m.VerificacaoEmail),
  { ssr: false },
);
