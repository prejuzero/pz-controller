import { getTranslations } from 'next-intl/server';

import { Perfil } from './perfil';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('perfil'))('titulo') };
}

export default function PaginaPerfil() {
  return <Perfil />;
}
