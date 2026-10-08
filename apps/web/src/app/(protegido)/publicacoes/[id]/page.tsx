import { getTranslations } from 'next-intl/server';

import { AcessoNegado } from '../../_casca/acesso-negado';
import { SePermitido } from '../../_casca/se-permitido';

import { DetalhePublicacao } from './detalhe-publicacao';

import type { Metadata } from 'next';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('publicacoes'))('titulo') };
}

export default async function PaginaPublicacao({ params }: Props) {
  const { id } = await params;
  return (
    <SePermitido permissao="publicacoes:ler" alternativa={<AcessoNegado />}>
      <DetalhePublicacao id={id} />
    </SePermitido>
  );
}
