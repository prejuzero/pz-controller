import { getTranslations } from 'next-intl/server';

import { AcessoNegado } from '../../_casca/acesso-negado';
import { SePermitido } from '../../_casca/se-permitido';

import { DetalhePrazo } from './detalhe-prazo';

import type { Metadata } from 'next';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('prazos'))('titulo') };
}

export default async function PaginaPrazo({ params }: Props) {
  const { id } = await params;
  return (
    <SePermitido permissao="prazos:ler" alternativa={<AcessoNegado />}>
      <DetalhePrazo id={id} />
    </SePermitido>
  );
}
