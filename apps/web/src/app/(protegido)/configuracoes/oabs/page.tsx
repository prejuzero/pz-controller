import { getTranslations } from 'next-intl/server';

import { Oabs } from './oabs';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('oabs'))('titulo') };
}

export default function PaginaOabs() {
  return <Oabs />;
}
