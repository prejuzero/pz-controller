import { getTranslations } from 'next-intl/server';

import { PaginaAcesso } from '../_acesso/pagina-acesso';

import { FormularioConviteCliente } from './formulario-convite-cliente';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('convite'))('titulo') };
}

/** Link do convite para a equipe (HU41): cria a senha; o 2FA vem no primeiro login. */
export default async function Convite() {
  const t = await getTranslations('convite');
  return (
    <PaginaAcesso titulo={t('titulo')}>
      <FormularioConviteCliente />
    </PaginaAcesso>
  );
}
