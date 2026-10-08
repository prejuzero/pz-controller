import { getTranslations } from 'next-intl/server';

import { AceiteDeTermos } from './aceite-de-termos';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('aceiteTermos'))('titulo') };
}

interface Props {
  searchParams: Promise<{ retorno?: string }>;
}

/** Tela de novo aceite (HU38): fora da casca, porque a API bloqueia o resto até o aceite. */
export default async function PaginaAceiteDeTermos({ searchParams }: Props) {
  return <AceiteDeTermos retorno={(await searchParams).retorno} />;
}
