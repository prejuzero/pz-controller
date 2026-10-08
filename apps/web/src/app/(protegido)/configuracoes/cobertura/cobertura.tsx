'use client';

import { EstadoCarregando, EstadoVazio, SeloStatus, TabelaDados, type ColunaTabela } from '@pz/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { useStatusDaCaptura } from '../../../../api/hooks';
import { formatarInstante } from '../../../../i18n/formatar';

import type { StatusDaCaptura } from '@pz/contracts';

type StatusDaOab = StatusDaCaptura['oabs'][number];

/**
 * Cobertura (HU19, transparência de cobertura): situação da fonte, última captura de cada OAB e o
 * que exige conferência manual. Os dados vêm prontos da API; aqui só a apresentação.
 */
export function Cobertura() {
  const t = useTranslations('cobertura');
  const status = useStatusDaCaptura();
  if (status.data === undefined) return <EstadoCarregando />;
  const { fonte, oabs } = status.data;
  const nomeDaFonte = fonte.id.toUpperCase();

  const colunas: ColunaTabela<StatusDaOab>[] = [
    { accessorKey: 'oab', header: t('colunas.oab') },
    {
      accessorKey: 'ultimoSucesso',
      header: t('colunas.ultima'),
      cell: ({ row }) =>
        row.original.ultimoSucesso === null
          ? t('nunca')
          : formatarInstante(row.original.ultimoSucesso),
    },
    {
      id: 'situacao',
      header: t('colunas.situacao'),
      cell: ({ row }) => {
        const { falhasConsecutivas: falhas, proximaExecucao } = row.original;
        if (falhas === 0) return <SeloStatus tom="sucesso">{t('emDia')}</SeloStatus>;
        return (
          <SeloStatus tom="alerta">
            {proximaExecucao === null
              ? t('comFalhasProxima', { falhas })
              : t('comFalhas', { falhas, quando: formatarInstante(proximaExecucao) })}
          </SeloStatus>
        );
      },
    },
  ];

  return (
    <div className="max-w-4xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{t('titulo')}</h1>
        <p className="text-texto-suave">{t('descricao', { fonte: nomeDaFonte })}</p>
      </div>

      <dl className="flex flex-wrap items-center gap-2 rounded-lg border border-borda p-4">
        <dt className="font-medium">
          {t('fonte')}: {nomeDaFonte}
        </dt>
        <dd className="flex flex-wrap items-center gap-2">
          {fonte.situacao === 'degradada' ? (
            <SeloStatus tom="perigo">{t('degradada')}</SeloStatus>
          ) : (
            <SeloStatus tom="sucesso">{t('operacional')}</SeloStatus>
          )}
          {fonte.desde === null ? null : (
            <span className="text-sm text-texto-suave">
              {t('desde', { desde: formatarInstante(fonte.desde) })}
            </span>
          )}
        </dd>
      </dl>

      <section className="space-y-3" aria-labelledby="oabs-monitoradas">
        <h2 id="oabs-monitoradas" className="text-lg font-semibold">
          {t('oabs')}
        </h2>
        <TabelaDados
          titulo={t('oabs')}
          colunas={colunas}
          dados={[...oabs]}
          idLinha={(o) => o.oabId}
          vazio={<EstadoVazio descricao={t('vazio')} />}
        />
      </section>

      <section className="space-y-2" aria-labelledby="conferencia-manual">
        <h2 id="conferencia-manual" className="text-lg font-semibold">
          {t('manual')}
        </h2>
        <p className="text-sm">{t('manualTexto')}</p>
        <Link href="/processos" className="text-sm underline underline-offset-4">
          {t('verProcessos')}
        </Link>
      </section>
    </div>
  );
}
