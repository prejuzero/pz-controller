import { getTranslations } from 'next-intl/server';

import { AcessoNegado } from '../_casca/acesso-negado';
import { SePermitido } from '../_casca/se-permitido';

import { ListaDePrazos } from './lista-de-prazos';
import { TabelaDePrazos } from './tabela-de-prazos';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('menu'))('prazos') };
}

export default function PaginaPrazos() {
  // Escritório: a lista de prazos (HU24). Curadoria: a tabela de prazos por ato (HU15).
  const escritorio = (
    <SePermitido permissao="prazos:ler" alternativa={<AcessoNegado />}>
      <ListaDePrazos />
    </SePermitido>
  );
  return (
    <SePermitido permissao="curadoria:tabela-prazos" alternativa={escritorio}>
      <TabelaDePrazos />
    </SePermitido>
  );
}
