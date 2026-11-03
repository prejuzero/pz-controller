import { getTranslations } from 'next-intl/server';

import { AcessoNegado } from '../_casca/acesso-negado';
import { SePermitido } from '../_casca/se-permitido';

import { TelaDeConferencias } from './tela-de-conferencias';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('conferencias'))('titulo') };
}

export default function PaginaConferencias() {
  return (
    <SePermitido permissao="prazos:ler" alternativa={<AcessoNegado />}>
      <TelaDeConferencias />
    </SePermitido>
  );
}
