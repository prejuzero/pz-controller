'use client';

import { avisar, Botao, EstadoCarregando, SeloStatus } from '@pz/ui';
import { ArrowLeft, ExternalLink, SearchCheck, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

import {
  useConferirPublicacao,
  useMarcarPublicacaoLida,
  usePublicacao,
  useResumoDaPublicacao,
} from '../../../../api/hooks';
import { formatarDataCivil, formatarInstante } from '../../../../i18n/formatar';
import { AlertaFormulario } from '../../../_acesso/alerta-formulario';
import { EnviarPorEmail } from '../../_casca/enviar-por-email';
import { SePermitido } from '../../_casca/se-permitido';

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
      {p.conferencia === 'pendente' ? <Conferencia id={p.id} /> : null}
      <EnviarPorEmail anexo={{ recurso: 'publicacao', recursoId: p.id }} />

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

      <ResumoPorIa id={p.id} />

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

/**
 * Resumo por IA (HU62): identificado como IA, com os trechos literais do teor que o comprovam.
 * É sugestão: o teor integral, logo abaixo, é o que vale.
 */
function ResumoPorIa({ id }: { id: string }) {
  const t = useTranslations('publicacoes.resumo');
  const resumo = useResumoDaPublicacao(id).data?.resumo;
  if (resumo === undefined || resumo === null) return null;
  return (
    <section
      className="space-y-3 rounded-lg border border-borda bg-superficie-elevada p-4"
      aria-labelledby="resumo-ia"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="resumo-ia" className="text-lg font-semibold">
          {t('titulo')}
        </h2>
        <SeloStatus tom="info">
          <Sparkles className="size-3" aria-hidden />
          {t('geradoPorIa')}
        </SeloStatus>
      </div>
      <p>{resumo.texto}</p>
      {resumo.providencia === null ? null : (
        <p>
          <span className="font-medium">{t('providencia')}</span> {resumo.providencia}
        </p>
      )}
      <div className="space-y-1">
        <h3 className="text-sm font-medium">{t('trechos')}</h3>
        {resumo.trechos.map((trecho) => (
          <blockquote key={trecho} className="border-l-2 border-borda-forte pl-3 text-sm italic">
            {trecho}
          </blockquote>
        ))}
      </div>
      <p className="text-xs text-texto-suave">{t('aviso')}</p>
    </section>
  );
}

/**
 * Capturada só pelo nome do escritório (HU42): pode ser homônimo. Até o advogado decidir, não há
 * processo nem prazo; confirmar segue como qualquer publicação, descartar tira das listas.
 */
function Conferencia({ id }: { id: string }) {
  const t = useTranslations('publicacoes.conferencia');
  const conferir = useConferirPublicacao();
  const router = useRouter();
  // mutateAsync, não o callback do mutate: ao confirmar, a publicação recarrega e este bloco some
  // antes do callback, que o React Query não chama depois de desmontar.
  const decidir = (decisao: 'confirmar' | 'descartar') => {
    conferir
      .mutateAsync({ id, decisao })
      .then(() => {
        avisar.sucesso(t(decisao === 'confirmar' ? 'confirmada' : 'descartada'));
        if (decisao === 'descartar') router.push('/publicacoes');
      })
      .catch(() => undefined); // O erro aparece no alerta do bloco (conferir.error).
  };
  return (
    <section
      className="space-y-3 rounded-lg border border-alerta bg-superficie-elevada p-4"
      aria-labelledby="conferencia"
    >
      <h2 id="conferencia" className="flex items-center gap-2 text-lg font-semibold">
        <SearchCheck className="size-5" aria-hidden />
        {t('titulo')}
      </h2>
      <p className="text-sm">{t('explicacao')}</p>
      <AlertaFormulario erro={conferir.error} seNaoAutorizado="credenciaisInvalidas" />
      <SePermitido permissao="processos:gerir">
        <div className="flex flex-wrap gap-2">
          <Botao
            carregando={conferir.isPending && conferir.variables.decisao === 'confirmar'}
            disabled={conferir.isPending}
            onClick={() => {
              decidir('confirmar');
            }}
          >
            {t('confirmar')}
          </Botao>
          <Botao
            variante="secundaria"
            carregando={conferir.isPending && conferir.variables.decisao === 'descartar'}
            disabled={conferir.isPending}
            onClick={() => {
              decidir('descartar');
            }}
          >
            {t('descartar')}
          </Botao>
        </div>
      </SePermitido>
    </section>
  );
}
