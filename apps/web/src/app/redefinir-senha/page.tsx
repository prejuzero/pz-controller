import { getTranslations } from 'next-intl/server';

import { PaginaAcesso } from '../_acesso/pagina-acesso';

import { FormularioRedefinirSenhaCliente } from './formulario-redefinir-senha-cliente';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('redefinirSenha'))('titulo') };
}

export default async function RedefinirSenha() {
  const t = await getTranslations('redefinirSenha');
  return (
    <PaginaAcesso titulo={t('titulo')}>
      <FormularioRedefinirSenhaCliente />
    </PaginaAcesso>
  );
}
