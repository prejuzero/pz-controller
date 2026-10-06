import { getTranslations } from 'next-intl/server';

import { PaginaAcesso } from '../_acesso/pagina-acesso';

import { FormularioEntrar } from './formulario-entrar';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('entrar'))('titulo') };
}

export default async function Entrar({ searchParams }: PageProps<'/entrar'>) {
  const { motivo, retorno } = await searchParams;
  const t = await getTranslations('entrar');
  const aviso =
    motivo === 'sessao-expirada'
      ? t('sessaoExpirada')
      : motivo === 'senha-redefinida'
        ? t('senhaRedefinida')
        : undefined;
  return (
    <PaginaAcesso titulo={t('titulo')}>
      {aviso === undefined ? null : (
        <p role="status" className="rounded-md border border-alerta p-3 text-sm">
          {aviso}
        </p>
      )}
      <FormularioEntrar retorno={typeof retorno === 'string' ? retorno : undefined} />
    </PaginaAcesso>
  );
}
