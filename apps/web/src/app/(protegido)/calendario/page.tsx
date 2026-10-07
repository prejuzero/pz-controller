import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { anoNoFuso } from '../../../i18n/formatar';
import { AcessoNegado } from '../_casca/acesso-negado';
import { SePermitido } from '../_casca/se-permitido';

import { Curadoria } from './curadoria';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('calendario'))('titulo') };
}

export default async function PaginaCalendario() {
  const t = await getTranslations('calendario');
  const escritorio = (
    <SePermitido permissao="calendario:ler" alternativa={<AcessoNegado />}>
      <div className="max-w-3xl space-y-2">
        <h1 className="text-2xl font-semibold">{t('titulo')}</h1>
        <p className="text-texto-suave">{t('descricaoEscritorio')}</p>
        <Link
          href="/configuracoes/feriados-locais"
          className="text-sm underline underline-offset-4"
        >
          {t('irFeriadosLocais')}
        </Link>
      </div>
    </SePermitido>
  );
  return (
    <SePermitido permissao="curadoria:calendario" alternativa={escritorio}>
      <Curadoria anoAtual={anoNoFuso(new Date())} />
    </SePermitido>
  );
}
