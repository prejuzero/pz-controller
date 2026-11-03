import { getTranslations } from 'next-intl/server';

import { AcessoNegado } from '../../_casca/acesso-negado';
import { SePermitido } from '../../_casca/se-permitido';

import { DetalheProcesso } from './detalhe-processo';

import type { Metadata } from 'next';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('processos'))('titulo') };
}

export default async function PaginaProcesso({ params, searchParams }: Props) {
  const { id } = await params;
  // "Encontrei intimação" na conferência de painel (HU36) abre o cadastro do prazo já aberto.
  const novoPrazo = (await searchParams).novoPrazo === '1';
  return (
    <SePermitido permissao="processos:ler" alternativa={<AcessoNegado />}>
      <DetalheProcesso id={id} abrirNovoPrazo={novoPrazo} />
    </SePermitido>
  );
}
