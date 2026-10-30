import { getTranslations } from 'next-intl/server';

import { Preferencias } from './preferencias';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('preferenciasDeNotificacao'))('titulo') };
}

export default function PaginaNotificacoes() {
  return <Preferencias />;
}
