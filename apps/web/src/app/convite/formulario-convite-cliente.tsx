'use client';

import dynamic from 'next/dynamic';

/** O token vem do fragmento da URL, que só existe no navegador: sem renderização no servidor. */
export const FormularioConviteCliente = dynamic(
  () => import('./formulario-convite').then((m) => m.FormularioConvite),
  { ssr: false },
);
