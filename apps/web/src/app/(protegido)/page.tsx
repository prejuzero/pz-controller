import { getTranslations } from 'next-intl/server';

import { AcessoNegado } from './_casca/acesso-negado';
import { SePermitido } from './_casca/se-permitido';
import { Dashboard } from './_dashboard/dashboard';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('menu'))('dashboard') };
}

export default function PaginaDashboard() {
  return (
    <SePermitido permissao="prazos:ler" alternativa={<AcessoNegado />}>
      <Dashboard />
    </SePermitido>
  );
}
