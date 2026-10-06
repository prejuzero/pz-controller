import { getTranslations } from 'next-intl/server';

import { SegundoFator } from './segundo-fator';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('segundoFator'))('titulo') };
}

export default async function PaginaSegundoFator({ searchParams }: PageProps<'/entrar/2fa'>) {
  const { retorno } = await searchParams;
  return <SegundoFator retorno={typeof retorno === 'string' ? retorno : undefined} />;
}
