import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { ROTA_SEGURANCA } from '../../../rotas';
import { SePermitido } from '../_casca/se-permitido';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('configuracoes'))('titulo') };
}

/** Configurações (seção 2.12, item 8): cada área entra aqui conforme é entregue. */
export default async function PaginaConfiguracoes() {
  const t = await getTranslations('configuracoes');
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">{t('titulo')}</h1>
      <ul className="divide-y divide-borda rounded-md border border-borda">
        <Item href="/configuracoes/perfil" titulo={t('perfil')} descricao={t('perfilDescricao')} />
        <Item href="/configuracoes/oabs" titulo={t('oabs')} descricao={t('oabsDescricao')} />
        <Item href={ROTA_SEGURANCA} titulo={t('seguranca')} descricao={t('segurancaDescricao')} />
        <Item
          href="/configuracoes/privacidade"
          titulo={t('privacidade')}
          descricao={t('privacidadeDescricao')}
        />
        <SePermitido permissao="publicacoes:ler">
          <Item
            href="/configuracoes/cobertura"
            titulo={t('cobertura')}
            descricao={t('coberturaDescricao')}
          />
        </SePermitido>
        <SePermitido permissao="calendario:ler">
          <Item
            href="/configuracoes/feriados-locais"
            titulo={t('feriadosLocais')}
            descricao={t('feriadosLocaisDescricao')}
          />
        </SePermitido>
      </ul>
    </div>
  );
}

function Item({ href, titulo, descricao }: { href: string; titulo: string; descricao: ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center justify-between gap-3 p-4 hover:bg-superficie-elevada focus-visible:ring-2 focus-visible:ring-foco focus-visible:outline-none"
      >
        <span>
          <span className="block font-medium">{titulo}</span>
          <span className="block text-sm text-texto-suave">{descricao}</span>
        </span>
        <ChevronRight className="size-4 shrink-0" aria-hidden />
      </Link>
    </li>
  );
}
