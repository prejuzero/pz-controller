import { getTranslations } from 'next-intl/server';

import { Consentimento } from './consentimento';

import type { PedidoDeAutorizacaoOAuth } from '../../../../api/integracoes';
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('consentimento'))('titulo') };
}

const OBRIGATORIOS = [
  'response_type',
  'client_id',
  'redirect_uri',
  'code_challenge',
  'code_challenge_method',
] as const;

/** Tela de consentimento do OAuth 2.1 (HU49): um app pede para agir em nome do advogado. */
export default async function PaginaAutorizar({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametros = await searchParams;
  const texto = (nome: string) => {
    const valor = parametros[nome];
    return typeof valor === 'string' ? valor : undefined;
  };
  const faltando = OBRIGATORIOS.some((nome) => texto(nome) === undefined);
  const scope = texto('scope');
  const state = texto('state');
  const pedido: PedidoDeAutorizacaoOAuth | null = faltando
    ? null
    : {
        response_type: texto('response_type') ?? '',
        client_id: texto('client_id') ?? '',
        redirect_uri: texto('redirect_uri') ?? '',
        code_challenge: texto('code_challenge') ?? '',
        code_challenge_method: texto('code_challenge_method') ?? '',
        ...(scope === undefined ? {} : { scope }),
        ...(state === undefined ? {} : { state }),
      };
  return <Consentimento pedido={pedido} />;
}
