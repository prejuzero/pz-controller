'use client';

import { Botao, EstadoCarregando, EstadoErro } from '@pz/ui';
import { ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { descreverErro } from '../../../../api/erros';
import { useAutorizarApp, useDescricaoDaAutorizacao } from '../../../../api/hooks';

import type { PedidoDeAutorizacaoOAuth } from '../../../../api/integracoes';

/**
 * Consentimento (HU49): mostra o app e o que ele pede, já conferidos pela API. Permitir emite o
 * código e volta ao app; negar volta com `error=access_denied` (OAuth 2.1, seção 4.1.2.1). Pedido
 * inválido não volta ao app: o endereço de retorno pode não ser dele.
 */
export function Consentimento({ pedido }: { pedido: PedidoDeAutorizacaoOAuth | null }) {
  const t = useTranslations('consentimento');
  if (pedido === null) {
    return <EstadoErro titulo={t('invalidoTitulo')} descricao={t('incompleto')} />;
  }
  return <Pedido pedido={pedido} />;
}

function Pedido({ pedido }: { pedido: PedidoDeAutorizacaoOAuth }) {
  const t = useTranslations('consentimento');
  const descricao = useDescricaoDaAutorizacao(pedido);
  const autorizar = useAutorizarApp();
  if (descricao.isError) {
    return (
      <EstadoErro
        titulo={t('invalidoTitulo')}
        descricao={descreverErro(descricao.error).descricao}
      />
    );
  }
  if (descricao.data === undefined) return <EstadoCarregando />;
  const { cliente, escopos, redirectUri } = descricao.data;
  const negar = () => {
    const destino = new URL(redirectUri);
    destino.searchParams.set('error', 'access_denied');
    if (pedido.state !== undefined) destino.searchParams.set('state', pedido.state);
    window.location.assign(destino.toString());
  };
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{t('pergunta', { app: cliente.nome })}</h1>
        <p className="text-texto-suave">{t('descricao')}</p>
      </div>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t('poderaTitulo')}</h2>
        <ul className="space-y-2">
          {escopos.map((e) => (
            <li key={e.escopo} className="flex items-start gap-2 text-sm">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              {e.descricao}
            </li>
          ))}
        </ul>
        <p className="text-sm text-texto-suave">{t('limites')}</p>
        <p className="break-all text-sm text-texto-suave">{t('retorno', { url: redirectUri })}</p>
      </section>
      <div className="flex flex-wrap gap-2">
        <Botao
          carregando={autorizar.isPending}
          onClick={() => {
            autorizar.mutate(pedido, {
              onSuccess: (r) => {
                window.location.assign(r.redirecionarPara);
              },
            });
          }}
        >
          {t('permitir')}
        </Botao>
        <Botao variante="secundaria" onClick={negar}>
          {t('negar')}
        </Botao>
      </div>
    </div>
  );
}
