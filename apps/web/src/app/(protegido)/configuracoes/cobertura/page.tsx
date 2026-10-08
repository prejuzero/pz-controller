import { getTranslations } from 'next-intl/server';

import { AcessoNegado } from '../../_casca/acesso-negado';
import { SePermitido } from '../../_casca/se-permitido';

import { Cobertura } from './cobertura';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('cobertura'))('titulo') };
}

export default function PaginaCobertura() {
  return (
    <SePermitido permissao="publicacoes:ler" alternativa={<AcessoNegado />}>
      <Cobertura />
    </SePermitido>
  );
}
