'use client';

import {
  avisar,
  Botao,
  Campo,
  EstadoCarregando,
  EstadoVazio,
  Selecao,
  TabelaDados,
  type ColunaTabela,
} from '@pz/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { usePublicarDocumento, useVersoesDosDocumentos } from '../../../../api/hooks';
import { formatarInstante } from '../../../../i18n/formatar';
import { AlertaFormulario } from '../../../_acesso/alerta-formulario';
import { TIPOS_DE_DOCUMENTO, type TipoDeDocumento } from '../../../_legal/documento-publico';

import type { DocumentosPendentes } from '@pz/contracts';

type Documento = DocumentosPendentes['itens'][number];

const CLASSE_TEXTO =
  'rounded-md border border-borda-forte bg-superficie-elevada p-2 text-sm font-normal';

/**
 * Publicação de documentos legais (PZ-303): o administrador da plataforma publica a nova versão
 * com prévia igual à página pública e confirmação explícita, porque todos os usuários terão de
 * aceitar de novo. O histórico mostra as versões já publicadas.
 */
export function DocumentosLegais() {
  const t = useTranslations('admin.documentos');
  const tl = useTranslations('legal');
  const versoes = useVersoesDosDocumentos();
  const colunas: ColunaTabela<Documento>[] = [
    { id: 'tipo', header: t('colunas.tipo'), cell: ({ row }) => tl(row.original.tipo) },
    { id: 'versao', header: t('colunas.versao'), cell: ({ row }) => row.original.versao },
    {
      id: 'publicadoEm',
      header: t('colunas.publicadoEm'),
      cell: ({ row }) => formatarInstante(row.original.publicadoEm),
    },
    {
      id: 'resumo',
      header: t('colunas.resumo'),
      cell: ({ row }) => row.original.resumoAlteracoes ?? '—',
    },
  ];
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-texto-suave">{t('descricao')}</p>
      <NovaVersao />
      {versoes.data === undefined ? (
        <EstadoCarregando />
      ) : (
        <TabelaDados
          titulo={t('historico')}
          colunas={colunas}
          dados={versoes.data.itens}
          idLinha={(d) => d.id}
          vazio={<EstadoVazio descricao={t('vazio')} />}
        />
      )}
    </div>
  );
}

function NovaVersao() {
  const t = useTranslations('admin.documentos');
  const tl = useTranslations('legal');
  const publicar = usePublicarDocumento();
  const [tipo, setTipo] = useState<TipoDeDocumento>('termos');
  const [versao, setVersao] = useState('');
  const [resumo, setResumo] = useState('');
  const [conteudo, setConteudo] = useState('');
  const [confirmo, setConfirmo] = useState(false);
  const pronto = confirmo && versao.trim() !== '' && conteudo.trim() !== '';

  return (
    <form
      method="post"
      noValidate
      className="grid gap-4 rounded-lg border border-borda p-4"
      aria-labelledby="nova-versao-titulo"
      onSubmit={(evento) => {
        evento.preventDefault();
        if (!pronto) return;
        publicar.mutate(
          {
            tipo,
            versao: versao.trim(),
            conteudo,
            ...(resumo.trim() === '' ? {} : { resumoAlteracoes: resumo.trim() }),
          },
          {
            onSuccess: (documento) => {
              avisar.sucesso(t('publicado', { versao: documento.versao }));
              setVersao('');
              setResumo('');
              setConteudo('');
              setConfirmo(false);
            },
          },
        );
      }}
    >
      <h2 id="nova-versao-titulo" className="text-lg font-semibold">
        {t('publicar')}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Selecao
          rotulo={t('tipo')}
          opcoes={TIPOS_DE_DOCUMENTO.map((valor) => ({ valor, rotulo: tl(valor) }))}
          valor={tipo}
          aoMudar={(valor) => {
            setTipo(valor as TipoDeDocumento);
          }}
        />
        <Campo
          rotulo={t('versao')}
          ajuda={t('versaoAjuda')}
          inputMode="decimal"
          maxLength={20}
          value={versao}
          onChange={(evento) => {
            setVersao(evento.target.value);
          }}
        />
      </div>
      <label className="grid gap-1.5 text-sm font-medium">
        {t('resumo')}
        <textarea
          className={`min-h-16 ${CLASSE_TEXTO}`}
          maxLength={2000}
          value={resumo}
          onChange={(evento) => {
            setResumo(evento.target.value);
          }}
        />
      </label>
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium">
          {t('conteudo')}
          <textarea
            className={`min-h-64 ${CLASSE_TEXTO}`}
            maxLength={200_000}
            value={conteudo}
            onChange={(evento) => {
              setConteudo(evento.target.value);
            }}
          />
        </label>
        {/* Mesma apresentação da página pública (documento-publico.tsx). */}
        <section aria-labelledby="previa-titulo" className="grid content-start gap-1.5">
          <h3 id="previa-titulo" className="text-sm font-medium">
            {t('previa')}
          </h3>
          <article className="max-h-96 overflow-y-auto rounded-md border border-borda p-3">
            {conteudo.trim() === '' ? (
              <p className="text-sm text-texto-suave">{t('previaVazia')}</p>
            ) : (
              <div className="leading-relaxed whitespace-pre-wrap">{conteudo}</div>
            )}
          </article>
        </section>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1 size-4"
          checked={confirmo}
          onChange={(evento) => {
            setConfirmo(evento.target.checked);
          }}
        />
        {t('confirmo')}
      </label>
      {publicar.isError ? (
        <AlertaFormulario erro={publicar.error} seNaoAutorizado="credenciaisInvalidas" />
      ) : null}
      <Botao
        type="submit"
        disabled={!pronto}
        carregando={publicar.isPending}
        className="justify-self-end"
      >
        {t('publicar')}
      </Botao>
    </form>
  );
}
