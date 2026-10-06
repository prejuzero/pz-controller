'use client';

import dynamic from 'next/dynamic';

/** O token vem do fragmento da URL, que só existe no navegador: sem renderização no servidor. */
export const FormularioRedefinirSenhaCliente = dynamic(
  () => import('./formulario-redefinir-senha').then((m) => m.FormularioRedefinirSenha),
  { ssr: false },
);
