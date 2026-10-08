import { getTranslations } from 'next-intl/server';

import { AcessoNegado } from '../_casca/acesso-negado';
import { SePermitido } from '../_casca/se-permitido';

import { Publicacoes } from './publicacoes';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('publicacoes'))('titulo') };
}

export default function PaginaPublicacoes() {
  return (
    <SePermitido permissao="publicacoes:ler" alternativa={<AcessoNegado />}>
      <Publicacoes />
    </SePermitido>
  );
}
