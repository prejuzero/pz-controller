import { getTranslations } from 'next-intl/server';

import { PaginaAcesso } from '../../_acesso/pagina-acesso';

import { VerificacaoDoHistorico } from './verificacao';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  // Página do QR code: fora dos buscadores (o código não pode ser indexado).
  return {
    title: (await getTranslations('verificacao'))('titulo'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

export default async function PaginaVerificacao({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const t = await getTranslations('verificacao');
  const { codigo } = await params;
  return (
    <PaginaAcesso titulo={t('titulo')} descricao={t('descricao')}>
      <VerificacaoDoHistorico codigo={decodeURIComponent(codigo)} />
    </PaginaAcesso>
  );
}
