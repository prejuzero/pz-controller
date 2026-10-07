import { getTranslations } from 'next-intl/server';

import { PaginaAcesso } from '../_acesso/pagina-acesso';

import { VerificacaoEmailCliente } from './verificacao-email-cliente';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('verificarEmail'))('titulo') };
}

export default async function VerificarEmail() {
  const t = await getTranslations('verificarEmail');
  return (
    <PaginaAcesso titulo={t('titulo')}>
      <VerificacaoEmailCliente />
    </PaginaAcesso>
  );
}
