import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';

import './globals.css';
import { Provedores } from './provedores';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return {
    title: { default: t('nome'), template: `%s · ${t('nome')}` },
    description: t('descricao'),
  };
}

export default async function LayoutRaiz({ children }: { children: ReactNode }) {
  return (
    <html lang={await getLocale()}>
      <body>
        <NextIntlClientProvider>
          <Provedores>{children}</Provedores>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
