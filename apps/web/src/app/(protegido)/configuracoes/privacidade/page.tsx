import { getTranslations } from 'next-intl/server';

import { Privacidade } from './privacidade';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('privacidade'))('titulo') };
}

export default function PaginaPrivacidade() {
  return <Privacidade />;
}
