import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { AcessoNegado } from '../_casca/acesso-negado';
import { SePermitido } from '../_casca/se-permitido';

import { TelaDeBusca } from './tela-de-busca';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('menu'))('busca') };
}

export default function PaginaBusca() {
  return (
    <SePermitido permissao="prazos:ler" alternativa={<AcessoNegado />}>
      {/* useSearchParams exige Suspense no App Router. */}
      <Suspense>
        <TelaDeBusca />
      </Suspense>
    </SePermitido>
  );
}
