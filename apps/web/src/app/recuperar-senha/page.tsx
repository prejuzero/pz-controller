import { getTranslations } from 'next-intl/server';

import { PaginaAcesso } from '../_acesso/pagina-acesso';

import { FormularioRecuperarSenha } from './formulario-recuperar-senha';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('recuperarSenha'))('titulo') };
}

export default async function RecuperarSenha() {
  const t = await getTranslations('recuperarSenha');
  return (
    <PaginaAcesso titulo={t('titulo')} descricao={t('descricao')}>
      <FormularioRecuperarSenha />
    </PaginaAcesso>
  );
}
