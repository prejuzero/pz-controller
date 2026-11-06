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

import { useBuscaDePrazos, usePrazos, useResponsaveis } from '../../../api/hooks';
import { STATUS_DO_PRAZO } from '../../../api/prazos';
import { campos } from '../../../filtro-global';
import { formatarDataCivil } from '../../../i18n/formatar';
import { useCienciaEmLote } from '../_casca/ciencia-em-lote';
import { BotoesExportar } from '../_casca/exportar';
import { BarraDeFiltroGlobal, useFiltroGlobal } from '../_casca/filtro-global';

import { Compromissos } from './compromissos';

import type { FiltrosDaTela } from '../../../api/busca';
import type { RecorteDaLista, StatusDoPrazo } from '../../../api/prazos';
import type { PrazoDaLista } from '@pz/contracts';

const ABAS = STATUS_DO_PRAZO;
/** O recorte do dashboard usa os mesmos campos da contagem dos cards (HU26). */
const DO_RECORTE = ['responsavelId', 'tribunal', 'clienteId'] as const;
/** Nas abas vale o filtro inteiro (PZ-349); o período é o do vencimento. */
const DAS_ABAS = ['de', 'ate', 'responsavelId', 'tribunal', 'clienteId'] as const;

interface Props {
  /** Aba inicial (ex.: o card "aguardando confirmação" do dashboard). */
  status?: StatusDoPrazo | undefined;
  /** Card do dashboard aberto na lista (HU26): substitui as abas até o advogado limpar. */
  recorte?: RecorteDaLista | undefined;
}

/** Prazos do escritório (HU24): por situação, do vencimento mais próximo ao mais distante. */
export function ListaDePrazos({ status: inicial, recorte: doCard }: Props) {
  const t = useTranslations('prazos');
  const [aba, setAba] = useState<StatusDoPrazo>(inicial ?? 'a-confirmar');
  const [recorte, setRecorte] = useState(doCard);
  const filtro = useFiltroGlobal();
  // Nome de quem responde por cada prazo (HU41, RF80): o titular acompanha a ciência da equipe.
  const responsaveis = useResponsaveis();
  const nomeDe = (id: string | null) =>
    id === null
      ? t('semResponsavel')
      : (responsaveis.data?.itens.find((m) => m.usuarioId === id)?.nome ?? t('semResponsavel'));
  const { de, ate } = filtro;
  const daLista = campos(filtro, DO_RECORTE);
  // A aba é a busca de prazos pela situação (HU28/HU29): mesma ordem da lista, sem data por
  // último. Sem período, o GET da lista basta.
  const daBusca: FiltrosDaTela = {
    statusPrazo: [aba],
    ...campos(filtro, ['responsavelId', 'tribunal', 'clienteId']),
    ...(de === undefined && ate === undefined
      ? {}
      : {
          periodo: {
            campoData: 'vencimento',
            ...(de === undefined ? {} : { de }),
            ...(ate === undefined ? {} : { ate }),
          },
        }),
  };
  const pelaBusca = recorte === undefined && (de !== undefined || ate !== undefined);
  const lista = usePrazos(
    recorte === undefined ? { status: aba, ...daLista } : { recorte, ...daLista },
    !pelaBusca,
  );
  const busca = useBuscaDePrazos(daBusca, pelaBusca);
  const prazos = pelaBusca ? busca : lista;

  const linhas: PrazoDaLista[] = pelaBusca
    ? (busca.data?.pages.flatMap((pagina) => pagina.itens) ?? [])
    : (lista.data?.pages.flatMap((pagina) => pagina.itens) ?? []);
  const lote = useCienciaEmLote(linhas);
  const colunas: ColunaTabela<PrazoDaLista>[] = [
    ...(lote.coluna === undefined ? [] : [lote.coluna]),
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
      // Do motor, pelo calendário do processo (PZ-334); nunca contado no navegador.
      id: 'diasUteis',
      header: t('colunas.diasUteis'),
      cell: ({ row }) =>
        row.original.diasUteisRestantes === null
          ? t('semDiasUteis')
          : t('diasUteis', { dias: row.original.diasUteisRestantes }),
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
      id: 'responsavel',
      header: t('colunas.responsavel'),
      cell: ({ row }) => nomeDe(row.original.responsavelId),
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
      <BarraDeFiltroGlobal aplicados={recorte === undefined ? DAS_ABAS : DO_RECORTE} />
      {/* A aba vira a busca de prazos pela situação (HU29); o recorte do dashboard não exporta. */}
      {recorte === undefined ? (
        <BotoesExportar
          pedido={(formato) => ({
            tipo: 'busca-prazos',
            formato,
            filtros: daBusca,
          })}
        />
      ) : null}
      {recorte === undefined ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <SeloStatus tom="info">{t(`recortes.${recorte}`)}</SeloStatus>
          <Botao
            variante="secundaria"
            onClick={() => {
              setRecorte(undefined);
            }}
          >
            {t('limparRecorte')}
          </Botao>
        </div>
      )}
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('titulo')}>
        {ABAS.map((status) => (
          <Botao
            key={status}
            variante={recorte === undefined && status === aba ? 'primaria' : 'secundaria'}
            aria-pressed={recorte === undefined && status === aba}
            onClick={() => {
              setRecorte(undefined);
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
          {lote.barra}
          <TabelaDados
            titulo={recorte === undefined ? t(`abas.${aba}`) : t(`recortes.${recorte}`)}
            colunas={colunas}
            dados={linhas}
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
