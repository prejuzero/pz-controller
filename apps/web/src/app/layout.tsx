import { headers } from 'next/headers';
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
  // A CSP traz um nonce por requisição (src/proxy.ts): a página tem de ser renderizada a cada
  // requisição para o Next.js aplicar o nonce aos scripts. Ler os cabeçalhos garante isso.
  await headers();
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
