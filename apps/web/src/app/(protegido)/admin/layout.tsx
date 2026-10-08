import { getTranslations } from 'next-intl/server';

import { AcessoNegado } from '../_casca/acesso-negado';
import { SePermitido } from '../_casca/se-permitido';

import { AbasAdmin } from './abas';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin'))('titulo') };
}

/** Área do administrador da plataforma (HU39): só com permissão de admin; a API confere de novo. */
export default async function LayoutAdmin({ children }: { children: ReactNode }) {
  const t = await getTranslations('admin');
  return (
    <SePermitido
      permissao={{ algum: ['admin:tenants', 'admin:filas'] }}
      alternativa={<AcessoNegado />}
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">{t('titulo')}</h1>
          <p className="max-w-3xl text-texto-suave">{t('descricao')}</p>
        </div>
        <AbasAdmin />
        {children}
      </div>
    </SePermitido>
  );
}
