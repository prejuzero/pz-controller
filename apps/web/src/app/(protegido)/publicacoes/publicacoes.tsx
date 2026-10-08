'use client';

import {
  Botao,
  Campo,
  EstadoCarregando,
  EstadoVazio,
  SeloStatus,
  TabelaDados,
  type ColunaTabela,
} from '@pz/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { usePublicacoes } from '../../../api/hooks';
import { formatarDataCivil } from '../../../i18n/formatar';

import type { FiltrosPublicacoes } from '../../../api/publicacoes';
import type { PublicacaoDoTenant } from '@pz/contracts';

// Só o começo do teor vai para a tabela: o integral fica no detalhe (teor longo não trava a lista).
const TAMANHO_TRECHO = 160;
const trecho = (teor: string) =>
  teor.length > TAMANHO_TRECHO ? `${teor.slice(0, TAMANHO_TRECHO)}…` : teor;

/** Publicações (HU18): lista da mais nova para a mais antiga, com as não lidas em destaque. */
export function Publicacoes() {
  const t = useTranslations('publicacoes');
  const [novas, setNovas] = useState(false);
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const filtros: FiltrosPublicacoes = {
    ...(novas ? { novas: 'true' as const } : {}),
    ...(de === '' ? {} : { de }),
    ...(ate === '' ? {} : { ate }),
  };
  const publicacoes = usePublicacoes(filtros);
  const filtrado = Object.keys(filtros).length > 0;

  const colunas: ColunaTabela<PublicacaoDoTenant>[] = [
    {
      accessorKey: 'dataDisponibilizacao',
      header: t('colunas.data'),
      cell: ({ row }) => (
        <Link
          href={`/publicacoes/${row.original.id}`}
          className={`underline underline-offset-4 ${row.original.lidaEm === null ? 'font-semibold' : ''}`}
        >
          {formatarDataCivil(row.original.dataDisponibilizacao)}
        </Link>
      ),
    },
    {
      id: 'situacao',
      header: t('colunas.situacao'),
      cell: ({ row }) =>
        row.original.lidaEm === null ? (
          <SeloStatus tom="info">{t('nova')}</SeloStatus>
        ) : (
          <SeloStatus tom="neutro">{t('lida')}</SeloStatus>
        ),
    },
    {
      accessorKey: 'numeroCnj',
      header: t('colunas.processo'),
      cell: ({ row }) => row.original.numeroCnj ?? '—',
    },
    {
      accessorKey: 'siglaTribunal',
      header: t('colunas.tribunal'),
      cell: ({ row }) => row.original.siglaTribunal ?? '—',
    },
    {
      accessorKey: 'tipoComunicacao',
      header: t('colunas.tipo'),
      cell: ({ row }) => row.original.tipoComunicacao ?? '—',
    },
    {
      id: 'trecho',
      header: t('colunas.trecho'),
      cell: ({ row }) => <span className="text-sm">{trecho(row.original.teor)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{t('titulo')}</h1>
        <p className="max-w-3xl text-texto-suave">{t('descricao')}</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={novas}
            onChange={(evento) => {
              setNovas(evento.target.checked);
            }}
          />
          {t('somenteNovas')}
        </label>
        <Campo
          rotulo={t('de')}
          type="date"
          className="w-44"
          value={de}
          onChange={(evento) => {
            setDe(evento.target.value);
          }}
        />
        <Campo
          rotulo={t('ate')}
          type="date"
          className="w-44"
          value={ate}
          onChange={(evento) => {
            setAte(evento.target.value);
          }}
        />
      </div>
      {publicacoes.data === undefined ? (
        <EstadoCarregando />
      ) : (
        <>
          <TabelaDados
            titulo={t('titulo')}
            colunas={colunas}
            dados={publicacoes.data.pages.flatMap((pagina) => pagina.itens)}
            idLinha={(publicacao) => publicacao.id}
            vazio={<EstadoVazio descricao={filtrado ? t('vazioFiltro') : t('vazio')} />}
          />
          {publicacoes.hasNextPage ? (
            <Botao
              variante="secundaria"
              carregando={publicacoes.isFetchingNextPage}
              onClick={() => {
                void publicacoes.fetchNextPage();
              }}
            >
              {t('carregarMais')}
            </Botao>
          ) : null}
        </>
      )}
    </div>
  );
}
