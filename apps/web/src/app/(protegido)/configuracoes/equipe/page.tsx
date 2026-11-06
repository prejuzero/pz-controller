import { getTranslations } from 'next-intl/server';

import { AcessoNegado } from '../../_casca/acesso-negado';
import { SePermitido } from '../../_casca/se-permitido';

import { Equipe } from './equipe';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('equipe'))('titulo') };
}

export default function PaginaEquipe() {
  return (
    <SePermitido permissao="usuarios:gerir" alternativa={<AcessoNegado />}>
      <Equipe />
    </SePermitido>
  );
}
