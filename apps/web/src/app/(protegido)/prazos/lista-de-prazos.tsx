'use client';

import {
  Botao,
  EstadoCarregando,
  EstadoVazio,
  SeloStatus,
  TabelaDados,
  type ColunaTabela,
} from '@pz/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { usePrazos } from '../../../api/hooks';
import { formatarDataCivil } from '../../../i18n/formatar';

import { Compromissos } from './compromissos';

import type { StatusDoPrazo } from '../../../api/prazos';
import type { Prazo } from '@pz/contracts';

const ABAS: readonly StatusDoPrazo[] = [
  'a-confirmar',
  'pendente',
  'vencido',
  'cumprido',
  'cancelado',
];

/** Prazos do escritório (HU24): por situação, do vencimento mais próximo ao mais distante. */
export function ListaDePrazos() {
  const t = useTranslations('prazos');
  const [aba, setAba] = useState<StatusDoPrazo>('a-confirmar');
  const prazos = usePrazos(aba);

  const colunas: ColunaTabela<Prazo>[] = [
    {
      accessorKey: 'vencimento',
      header: t('colunas.vencimento'),
      cell: ({ row }) => (
        <Link href={`/prazos/${row.original.id}`} className="underline underline-offset-4">
          {row.original.vencimento === null
            ? t('semData')
            : formatarDataCivil(row.original.vencimento)}
        </Link>
      ),
    },
    {
      id: 'situacao',
      header: t('colunas.situacao'),
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.vencimentoManual ? (
            <SeloStatus tom="neutro">{t('manual')}</SeloStatus>
          ) : null}
          {row.original.classificacaoIncerta ? (
            <SeloStatus tom="alerta">{t('incerta')}</SeloStatus>
          ) : null}
        </div>
      ),
    },
    { accessorKey: 'tipoAto', header: t('colunas.ato') },
    {
      id: 'processo',
      header: t('colunas.processo'),
      cell: ({ row }) => (
        <Link
          href={`/processos/${row.original.processoId}`}
          className="underline underline-offset-4"
        >
          {row.original.jurisdicao.tribunal ?? t('colunas.processo')}
        </Link>
      ),
    },
    {
      id: 'ciencia',
      header: t('colunas.ciencia'),
      cell: ({ row }) => t(`ciencia.${row.original.statusCiencia}`),
    },
    {
      id: 'origem',
      header: t('colunas.origem'),
      cell: ({ row }) => t(`origem.${row.original.origem}`),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{t('titulo')}</h1>
        <p className="max-w-3xl text-texto-suave">{t('descricao')}</p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('titulo')}>
        {ABAS.map((status) => (
          <Botao
            key={status}
            variante={status === aba ? 'primaria' : 'secundaria'}
            aria-pressed={status === aba}
            onClick={() => {
              setAba(status);
            }}
          >
            {t(`abas.${status}`)}
          </Botao>
        ))}
      </div>
      {prazos.data === undefined ? (
        <EstadoCarregando />
      ) : (
        <>
          <TabelaDados
            titulo={t(`abas.${aba}`)}
            colunas={colunas}
            dados={prazos.data.pages.flatMap((pagina) => pagina.itens)}
            idLinha={(prazo) => prazo.id}
            vazio={<EstadoVazio descricao={t('vazio')} />}
          />
          {prazos.hasNextPage ? (
            <Botao
              variante="secundaria"
              carregando={prazos.isFetchingNextPage}
              onClick={() => {
                void prazos.fetchNextPage();
              }}
            >
              {t('carregarMais')}
            </Botao>
          ) : null}
        </>
      )}
      <Compromissos />
    </div>
  );
}
