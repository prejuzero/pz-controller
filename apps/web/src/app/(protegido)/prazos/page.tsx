import { getTranslations } from 'next-intl/server';

import { AcessoNegado } from '../_casca/acesso-negado';
import { SePermitido } from '../_casca/se-permitido';

import { TabelaDePrazos } from './tabela-de-prazos';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('menu'))('prazos') };
}

export default async function PaginaPrazos() {
  const t = await getTranslations();
  // A lista de prazos do escritório chega com a HU16; até lá, a página provisória da seção.
  const escritorio = (
    <SePermitido permissao="prazos:ler" alternativa={<AcessoNegado />}>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{t('menu.prazos')}</h1>
        <p className="text-texto-suave">{t('secao.emConstrucao')}</p>
      </div>
    </SePermitido>
  );
  return (
    <SePermitido permissao="curadoria:tabela-prazos" alternativa={escritorio}>
      <TabelaDePrazos />
    </SePermitido>
  );
}
