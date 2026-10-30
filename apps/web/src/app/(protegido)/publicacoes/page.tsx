import { getTranslations } from 'next-intl/server';

import { AcessoNegado } from '../_casca/acesso-negado';
import { SePermitido } from '../_casca/se-permitido';

import { Publicacoes } from './publicacoes';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('publicacoes'))('titulo') };
}

export default async function PaginaPublicacoes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // O card "novas publicações" do dashboard (HU26) abre a lista já filtrada.
  const { novas } = await searchParams;
  return (
    <SePermitido permissao="publicacoes:ler" alternativa={<AcessoNegado />}>
      <Publicacoes somenteNovas={novas === 'true'} />
    </SePermitido>
  );
}
