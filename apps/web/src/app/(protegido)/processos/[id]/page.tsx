import { getTranslations } from 'next-intl/server';

import { AcessoNegado } from '../../_casca/acesso-negado';
import { SePermitido } from '../../_casca/se-permitido';

import { DetalheProcesso } from './detalhe-processo';

import type { Metadata } from 'next';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('processos'))('titulo') };
}

export default async function PaginaProcesso({ params }: Props) {
  const { id } = await params;
  return (
    <SePermitido permissao="processos:ler" alternativa={<AcessoNegado />}>
      <DetalheProcesso id={id} />
    </SePermitido>
  );
}
