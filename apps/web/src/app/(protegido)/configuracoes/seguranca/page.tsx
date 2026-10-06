import { getTranslations } from 'next-intl/server';

import { Seguranca } from './seguranca';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('seguranca'))('titulo') };
}

export default function PaginaSeguranca() {
  return <Seguranca />;
}
