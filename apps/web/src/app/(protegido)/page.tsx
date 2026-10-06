import { getTranslations } from 'next-intl/server';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('menu'))('dashboard') };
}

// Provisória: o conteúdo do dashboard chega em história própria.
export default async function Dashboard() {
  const t = await getTranslations();
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">{t('menu.dashboard')}</h1>
      <p className="text-texto-suave">{t('secao.emConstrucao')}</p>
    </div>
  );
}
