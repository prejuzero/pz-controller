import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { secaoDoSegmento } from '../../../navegacao';

import type { Metadata } from 'next';

interface Props {
  params: Promise<{ secao: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const item = secaoDoSegmento((await params).secao);
  if (item === undefined) return {};
  return { title: (await getTranslations('menu'))(item.chave) };
}

// Página provisória de cada seção do menu; cada tela real (rota estática) passa a ter precedência.
export default async function Secao({ params }: Props) {
  const item = secaoDoSegmento((await params).secao);
  if (item === undefined) notFound();
  const t = await getTranslations();
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">{t(`menu.${item.chave}`)}</h1>
      <p className="text-texto-suave">{t('secao.emConstrucao')}</p>
    </div>
  );
}
