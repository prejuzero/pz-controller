import { getTranslations } from 'next-intl/server';

import { AcessoNegado } from '../../_casca/acesso-negado';
import { SePermitido } from '../../_casca/se-permitido';

import { NomesMonitorados } from './nomes-monitorados';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('nomesMonitorados'))('titulo') };
}

export default function PaginaNomesMonitorados() {
  return (
    <SePermitido permissao="usuarios:gerir" alternativa={<AcessoNegado />}>
      <NomesMonitorados />
    </SePermitido>
  );
}
