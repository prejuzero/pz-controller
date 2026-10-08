'use client';

import { EstadoCarregando, SeloStatus } from '@pz/ui';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

import { useMarcarPublicacaoLida, usePublicacao } from '../../../../api/hooks';
import { formatarDataCivil, formatarInstante } from '../../../../i18n/formatar';

/**
 * Detalhe da publicação (HU18): teor integral, link da fonte e data de captura. Abrir registra a
 * leitura uma vez (indício de conhecimento, não ciência).
 */
export function DetalhePublicacao({ id }: { id: string }) {
  const t = useTranslations('publicacoes');
  const publicacao = usePublicacao(id);
  const marcarLida = useMarcarPublicacaoLida();
  const registrada = useRef(false);
  const naoLida = publicacao.data?.lidaEm === null;

  useEffect(() => {
    if (!naoLida || registrada.current) return;
    registrada.current = true;
    marcarLida.mutate(id);
  }, [naoLida, id, marcarLida]);

  if (publicacao.data === undefined) return <EstadoCarregando />;
  const p = publicacao.data;

  return (
    <div className="max-w-4xl space-y-6">
      <Link
        href="/publicacoes"
        className="inline-flex items-center gap-2 text-sm underline underline-offset-4"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t('detalhe.voltar')}
      </Link>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">
          {[p.tipoComunicacao, formatarDataCivil(p.dataDisponibilizacao)]
            .filter((parte) => parte !== null)
            .join(' · ')}
        </h1>
        <div className="flex flex-wrap gap-2">
          {p.lidaEm === null ? (
            <SeloStatus tom="info">{t('nova')}</SeloStatus>
          ) : (
            <SeloStatus tom="neutro">{t('lida')}</SeloStatus>
          )}
        </div>
      </div>

      <dl className="grid gap-3 rounded-lg border border-borda p-4 sm:grid-cols-2">
        <Item rotulo={t('colunas.processo')}>
          {p.processoId === null ? (
            (p.numeroCnj ?? t('semProcesso'))
          ) : (
            <Link href={`/processos/${p.processoId}`} className="underline underline-offset-4">
              {p.numeroCnj ?? t('detalhe.processo')}
            </Link>
          )}
        </Item>
        <Item rotulo={t('colunas.tribunal')}>{p.siglaTribunal ?? '—'}</Item>
        <Item rotulo={t('detalhe.origem')}>{p.fonte.toUpperCase()}</Item>
        <Item rotulo={t('detalhe.capturadaEm')}>{formatarInstante(p.capturadoEm)}</Item>
        <Item rotulo={t('detalhe.recebidaEm')}>{formatarInstante(p.recebidaEm)}</Item>
        {p.lidaEm === null ? null : (
          <Item rotulo={t('detalhe.lidaEm')}>{formatarInstante(p.lidaEm)}</Item>
        )}
      </dl>

      <section className="space-y-3" aria-labelledby="teor">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="teor" className="text-lg font-semibold">
            {t('detalhe.teor')}
          </h2>
          <a
            href={p.urlFonte}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm underline underline-offset-4"
          >
            {t('detalhe.fonte')}
            <ExternalLink className="size-4" aria-hidden />
          </a>
        </div>
        {/* Texto puro, nunca HTML: o teor vem de fonte externa. */}
        <div className="whitespace-pre-wrap break-words rounded-lg border border-borda p-4 text-sm leading-relaxed">
          {p.teor}
        </div>
        <p className="text-sm text-texto-suave">{t('detalhe.indicio')}</p>
      </section>
    </div>
  );
}

function Item({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-texto-suave">{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}
