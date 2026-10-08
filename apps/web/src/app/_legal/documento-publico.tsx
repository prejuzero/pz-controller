'use client';

import { EstadoCarregando } from '@pz/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { useDocumentosVigentes } from '../../api/hooks';
import { formatarInstante } from '../../i18n/formatar';

export const TIPOS_DE_DOCUMENTO = ['termos', 'privacidade', 'cobertura'] as const;
export type TipoDeDocumento = (typeof TIPOS_DE_DOCUMENTO)[number];

/** Contato do encarregado (DPO), quando configurado; sem ele, a linha não aparece. */
const EMAIL_DO_ENCARREGADO = process.env.NEXT_PUBLIC_ENCARREGADO_EMAIL;

/**
 * Página pública de um documento legal (HU38): a versão vigente publicada, com versão e data.
 * O texto é do jurídico (cadastrado no banco); sem versão publicada, avisa que está em elaboração.
 */
export function DocumentoPublico({ tipo }: { tipo: TipoDeDocumento }) {
  const t = useTranslations('legal');
  const vigentes = useDocumentosVigentes();
  const documento = vigentes.data?.itens.find((d) => d.tipo === tipo);
  return (
    <div className="min-h-dvh bg-fundo text-texto">
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <h1 className="text-2xl font-semibold">{t(tipo)}</h1>
        {vigentes.data === undefined ? (
          <EstadoCarregando />
        ) : documento === undefined ? (
          <p className="text-texto-suave">{t('emElaboracao')}</p>
        ) : (
          <article className="space-y-4">
            <p className="text-sm text-texto-suave">
              {t('versao', {
                versao: documento.versao,
                data: formatarInstante(documento.publicadoEm),
              })}
            </p>
            <div className="leading-relaxed whitespace-pre-wrap">{documento.conteudo}</div>
          </article>
        )}
        {tipo === 'privacidade' && EMAIL_DO_ENCARREGADO !== undefined ? (
          <p className="text-sm">{t('encarregado', { email: EMAIL_DO_ENCARREGADO })}</p>
        ) : null}
        <nav aria-label={t('outrosDocumentos')} className="flex flex-wrap gap-4 text-sm">
          {TIPOS_DE_DOCUMENTO.filter((outro) => outro !== tipo).map((outro) => (
            <Link key={outro} href={`/${outro}`} className="underline underline-offset-4">
              {t(outro)}
            </Link>
          ))}
        </nav>
      </main>
    </div>
  );
}
