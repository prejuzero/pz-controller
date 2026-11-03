'use client';

import {
  avisar,
  Botao,
  EstadoCarregando,
  EstadoVazio,
  SeloStatus,
  TabelaDados,
  type ColunaTabela,
} from '@pz/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useConferencias, usePermissao, useRegistrarConferencia } from '../../../api/hooks';
import { formatarDataCivil, formatarInstante } from '../../../i18n/formatar';

import type { ConferenciasDoEscritorio } from '@pz/contracts';

type Item = ConferenciasDoEscritorio['itens'][number];

/**
 * Conferências de painel (HU36, RF92/RF93): o aviso do que é automático e do que exige
 * conferência, e a lista dos processos com a ação de um clique ("conferido, sem novidade") ou
 * "encontrei intimação", que registra e abre o cadastro do prazo no processo.
 */
export function TelaDeConferencias() {
  const t = useTranslations('conferencias');
  const router = useRouter();
  const conferencias = useConferencias();
  const registrar = useRegistrarConferencia();
  const podeRegistrar = usePermissao('prazos:confirmar') === true;

  const colunas: ColunaTabela<Item>[] = [
    {
      id: 'processo',
      header: t('colunas.processo'),
      cell: ({ row }) => (
        <Link
          href={`/processos/${row.original.processoId}`}
          className="underline underline-offset-4"
        >
          {row.original.numeroCnj}
        </Link>
      ),
    },
    {
      id: 'tribunal',
      header: t('colunas.tribunal'),
      cell: ({ row }) => row.original.tribunal ?? '',
    },
    {
      id: 'motivo',
      header: t('colunas.motivo'),
      cell: ({ row }) =>
        row.original.sigiloso ? t('sigiloso') : t(`coberturas.${row.original.cobertura}`),
    },
    {
      id: 'situacao',
      header: t('colunas.situacao'),
      cell: ({ row }) =>
        row.original.atrasada ? (
          <SeloStatus tom="perigo">
            {t('atrasadaDesde', { data: formatarDataCivil(row.original.proxima) })}
          </SeloStatus>
        ) : (
          <SeloStatus tom="neutro">
            {t('proxima', { data: formatarDataCivil(row.original.proxima) })}
          </SeloStatus>
        ),
    },
    {
      id: 'ultima',
      header: t('colunas.ultima'),
      cell: ({ row }) =>
        row.original.ultimaConferencia === null
          ? t('nunca')
          : `${formatarInstante(row.original.ultimaConferencia.realizadaEm)} · ${t(
              `resultados.${row.original.ultimaConferencia.resultado}`,
            )}`,
    },
    {
      id: 'acoes',
      header: t('colunas.acoes'),
      cell: ({ row }) =>
        podeRegistrar ? (
          <div className="flex flex-wrap gap-2">
            <Botao
              tamanho="sm"
              disabled={registrar.isPending}
              onClick={() => {
                registrar.mutate(
                  { id: row.original.processoId, resultado: 'sem-novidade' },
                  {
                    onSuccess: () => {
                      avisar.sucesso(t('registrada'));
                    },
                  },
                );
              }}
            >
              {t('semNovidade')}
            </Botao>
            <Botao
              tamanho="sm"
              variante="secundaria"
              disabled={registrar.isPending}
              onClick={() => {
                registrar.mutate(
                  { id: row.original.processoId, resultado: 'nova-intimacao' },
                  {
                    onSuccess: () => {
                      router.push(`/processos/${row.original.processoId}?novoPrazo=1`);
                    },
                  },
                );
              }}
            >
              {t('novaIntimacao')}
            </Botao>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{t('titulo')}</h1>
        <p className="max-w-3xl text-texto-suave">{t('descricao')}</p>
      </div>
      <section
        aria-labelledby="aviso-cobertura"
        className="max-w-3xl space-y-2 rounded-lg border-2 border-alerta p-4 text-sm"
      >
        <h2 id="aviso-cobertura" className="font-semibold">
          {t('aviso.titulo')}
        </h2>
        <p>{t('aviso.automatico')}</p>
        <p>{t('aviso.conferencia')}</p>
        <Link href="/cobertura" className="underline underline-offset-4">
          {t('aviso.termos')}
        </Link>
      </section>
      {conferencias.data === undefined ? (
        <EstadoCarregando />
      ) : conferencias.data.itens.length === 0 ? (
        <EstadoVazio titulo={t('vazio')} descricao={t('vazioDescricao')} />
      ) : (
        <TabelaDados titulo={t('titulo')} colunas={colunas} dados={conferencias.data.itens} />
      )}
    </div>
  );
}
