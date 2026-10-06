import { getTranslations } from 'next-intl/server';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('entrar'))('titulo') };
}

export default async function Entrar({ searchParams }: PageProps<'/entrar'>) {
  const { motivo } = await searchParams;
  const t = await getTranslations('entrar');
  return (
    <main className="mx-auto max-w-sm space-y-4 p-6">
      <h1 className="text-2xl font-semibold">{t('titulo')}</h1>
      {motivo === 'sessao-expirada' && (
        <p role="status" className="rounded-md border border-alerta p-3 text-sm">
          {t('sessaoExpirada')}
        </p>
      )}
      <p className="text-sm text-texto-suave">{t('emBreve')}</p>
    </main>
  );
}
