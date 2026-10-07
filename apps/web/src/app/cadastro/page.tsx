import { getTranslations } from 'next-intl/server';

import { PaginaAcesso } from '../_acesso/pagina-acesso';

import { AssistenteCadastroCliente } from './assistente-cadastro-cliente';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('cadastro'))('titulo') };
}

export default async function Cadastro() {
  const t = await getTranslations('cadastro');
  return (
    <PaginaAcesso titulo={t('titulo')}>
      <AssistenteCadastroCliente />
    </PaginaAcesso>
  );
}
