'use client';

import { EstadoCarregando, EstadoVazio, SeloStatus, TabelaDados, type ColunaTabela } from '@pz/ui';
import { useTranslations } from 'next-intl';

import { useIntegracoes, useResumoDasFilas } from '../../../../api/hooks';
import { formatarInstante } from '../../../../i18n/formatar';

import type { PainelDeIntegracoes, ResumoDasFilas } from '@pz/contracts';

type Adaptador = PainelDeIntegracoes['adaptadores'][number];
type Falha = PainelDeIntegracoes['falhas'][number];
type Fila = ResumoDasFilas['filas'][number];

// Fora do Next (servido pela API): navegação de página inteira, não <Link>.
const PAINEL_DE_FILAS = '/admin/filas';

const TOM = { operacional: 'sucesso', degradado: 'alerta', indisponivel: 'perigo' } as const;
const quando = (instante: string | null) => (instante === null ? '—' : formatarInstante(instante));

/** Saúde das integrações e resumo das filas (HU39); atualiza a cada 30 s. */
export function Integracoes() {
  const t = useTranslations('admin.integracoes');
  const painel = useIntegracoes();
  const filas = useResumoDasFilas();

  const colunasAdaptadores: ColunaTabela<Adaptador>[] = [
    { id: 'adaptador', header: t('colunas.adaptador'), cell: ({ row }) => row.original.adaptador },
    {
      id: 'estado',
      header: t('colunas.estado'),
      cell: ({ row }) => (
        <SeloStatus tom={TOM[row.original.estado]}>
          {t(`estados.${row.original.estado}`)}
        </SeloStatus>
      ),
    },
    {
      id: 'ultimoSucesso',
      header: t('colunas.ultimoSucesso'),
      cell: ({ row }) => quando(row.original.ultimoSucesso),
    },
    {
      id: 'ultimaFalha',
      header: t('colunas.ultimaFalha'),
      cell: ({ row }) => quando(row.original.ultimaFalha),
    },
    { id: 'erro', header: t('colunas.erro'), cell: ({ row }) => row.original.erro ?? '—' },
  ];
  const colunasFalhas: ColunaTabela<Falha>[] = [
    { id: 'em', header: t('colunas.em'), cell: ({ row }) => formatarInstante(row.original.em) },
    { id: 'adaptador', header: t('colunas.adaptador'), cell: ({ row }) => row.original.adaptador },
    { id: 'instancia', header: t('colunas.instancia'), cell: ({ row }) => row.original.instancia },
    { id: 'erro', header: t('colunas.erro'), cell: ({ row }) => row.original.erro || '—' },
  ];
  const colunasFilas: ColunaTabela<Fila>[] = (
    ['fila', 'aguardando', 'ativos', 'atrasados', 'falhos', 'mortos'] as const
  ).map((campo) => ({
    id: campo,
    header: t(`colunas.${campo}`),
    cell: ({ row }) =>
      campo === 'mortos' && row.original.mortos > 0 ? (
        <SeloStatus tom="perigo">{String(row.original.mortos)}</SeloStatus>
      ) : (
        String(row.original[campo])
      ),
  }));

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('adaptadores')}</h2>
        {painel.data === undefined ? (
          <EstadoCarregando />
        ) : (
          <TabelaDados
            titulo={t('adaptadores')}
            colunas={colunasAdaptadores}
            dados={[...painel.data.adaptadores]}
            idLinha={(a) => a.adaptador}
            vazio={<EstadoVazio descricao={t('semAdaptadores')} />}
          />
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('falhas')}</h2>
        {painel.data === undefined ? (
          <EstadoCarregando />
        ) : (
          <TabelaDados
            titulo={t('falhas')}
            colunas={colunasFalhas}
            dados={[...painel.data.falhas]}
            idLinha={(f) => `${f.instancia}|${f.adaptador}|${f.em}`}
            vazio={<EstadoVazio descricao={t('semFalhas')} />}
          />
        )}
      </section>
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t('filas')}</h2>
          {/* Painel do BullMQ (HU10), só leitura; servido pela API e encaminhado pelo proxy. */}
          <a href={PAINEL_DE_FILAS} className="text-sm underline underline-offset-4">
            {t('abrirPainelDeFilas')}
          </a>
        </div>
        {filas.data === undefined ? (
          <EstadoCarregando />
        ) : (
          <TabelaDados
            titulo={t('filas')}
            colunas={colunasFilas}
            dados={[...filas.data.filas]}
            idLinha={(f) => f.fila}
            vazio={<EstadoVazio descricao={t('semFilas')} />}
          />
        )}
      </section>
    </div>
  );
}
