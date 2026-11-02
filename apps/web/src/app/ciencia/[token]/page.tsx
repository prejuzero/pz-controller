import { getTranslations } from 'next-intl/server';

import { PaginaAcesso } from '../../_acesso/pagina-acesso';

import { ConfirmacaoDeCiencia } from './confirmacao';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  // Página do link do e-mail: fora dos buscadores (o token não pode ser indexado).
  return {
    title: (await getTranslations('ciencia'))('titulo'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

export default async function PaginaCiencia({ params }: { params: Promise<{ token: string }> }) {
  const t = await getTranslations('ciencia');
  const { token } = await params;
  return (
    <PaginaAcesso titulo={t('titulo')} descricao={t('descricao')}>
      <ConfirmacaoDeCiencia token={token} />
    </PaginaAcesso>
  );
}
