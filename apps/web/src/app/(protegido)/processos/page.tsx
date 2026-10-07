import { getTranslations } from 'next-intl/server';

import { AcessoNegado } from '../_casca/acesso-negado';
import { SePermitido } from '../_casca/se-permitido';

import { Processos } from './processos';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('processos'))('titulo') };
}

export default function PaginaProcessos() {
  return (
    <SePermitido permissao="processos:ler" alternativa={<AcessoNegado />}>
      <Processos />
    </SePermitido>
  );
}
