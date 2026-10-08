import { getTranslations } from 'next-intl/server';

import { DocumentoPublico } from '../_legal/documento-publico';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('legal'))('cobertura') };
}

export default function Pagina() {
  return <DocumentoPublico tipo="cobertura" />;
}
