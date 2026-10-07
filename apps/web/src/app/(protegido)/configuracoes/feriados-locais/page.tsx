import { getTranslations } from 'next-intl/server';

import { anoNoFuso } from '../../../../i18n/formatar';
import { AcessoNegado } from '../../_casca/acesso-negado';
import { SePermitido } from '../../_casca/se-permitido';

import { FeriadosLocais } from './feriados-locais';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('feriadosLocais'))('titulo') };
}

export default function PaginaFeriadosLocais() {
  return (
    <SePermitido permissao="calendario:ler" alternativa={<AcessoNegado />}>
      <FeriadosLocais anoAtual={anoNoFuso(new Date())} />
    </SePermitido>
  );
}
