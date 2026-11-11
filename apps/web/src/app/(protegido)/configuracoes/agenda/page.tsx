import { getTranslations } from 'next-intl/server';

import { AcessoNegado } from '../../_casca/acesso-negado';
import { SePermitido } from '../../_casca/se-permitido';

import { AgendaPessoal } from './agenda';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('agendaPessoal'))('titulo') };
}

export default function PaginaAgenda() {
  return (
    <SePermitido permissao="prazos:ler" alternativa={<AcessoNegado />}>
      <AgendaPessoal />
    </SePermitido>
  );
}
