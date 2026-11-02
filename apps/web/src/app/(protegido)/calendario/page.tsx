import Link from 'next/link';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { anoNoFuso } from '../../../i18n/formatar';
import { AcessoNegado } from '../_casca/acesso-negado';
import { SePermitido } from '../_casca/se-permitido';

import { CalendarioDePrazos } from './calendario-de-prazos';
import { Curadoria } from './curadoria';
import { dataNoFuso } from './grade';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('calendario'))('titulo') };
}

export default async function PaginaCalendario() {
  await connection();
  const t = await getTranslations('calendario');
  // "Hoje" vem do servidor, no fuso de Brasília (o relógio do navegador não decide o dia).
  const agora = new Date();
  // Escritório: o calendário de prazos (HU27). Curadoria: o calendário forense (HU13).
  const escritorio = (
    <SePermitido permissao="prazos:ler" alternativa={<AcessoNegado />}>
      <Suspense>
        <CalendarioDePrazos hoje={dataNoFuso(agora)} />
      </Suspense>
      <SePermitido permissao="calendario:ler">
        <p className="mt-4 text-sm text-texto-suave">
          {t('descricaoEscritorio')}{' '}
          <Link href="/configuracoes/feriados-locais" className="underline underline-offset-4">
            {t('irFeriadosLocais')}
          </Link>
        </p>
      </SePermitido>
    </SePermitido>
  );
  return (
    <SePermitido permissao="curadoria:calendario" alternativa={escritorio}>
      <Curadoria anoAtual={anoNoFuso(agora)} />
    </SePermitido>
  );
}
