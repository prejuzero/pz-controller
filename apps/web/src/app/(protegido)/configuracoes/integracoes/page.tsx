import { getTranslations } from 'next-intl/server';

import { AcessoNegado } from '../../_casca/acesso-negado';
import { SePermitido } from '../../_casca/se-permitido';

import { Integracoes } from './integracoes';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('integracoes'))('titulo') };
}

export default function PaginaIntegracoes() {
  return (
    <SePermitido permissao="integracoes:gerir" alternativa={<AcessoNegado />}>
      <Integracoes />
    </SePermitido>
  );
}
