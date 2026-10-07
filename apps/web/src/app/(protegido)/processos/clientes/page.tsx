import { getTranslations } from 'next-intl/server';

import { AcessoNegado } from '../../_casca/acesso-negado';
import { SePermitido } from '../../_casca/se-permitido';

import { Clientes } from './clientes';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('clientes'))('titulo') };
}

export default function PaginaClientes() {
  return (
    <SePermitido permissao="processos:ler" alternativa={<AcessoNegado />}>
      <Clientes />
    </SePermitido>
  );
}
