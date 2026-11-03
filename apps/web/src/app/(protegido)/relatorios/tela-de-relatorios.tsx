'use client';

import {
  Botao,
  EstadoCarregando,
  EstadoVazio,
  SeletorData,
  Selecao,
  SeloStatus,
  TabelaDados,
  type ColunaTabela,
  type TomSelo,
} from '@pz/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useRelatorios, useSolicitarRelatorio } from '../../../api/hooks';
import { formatarInstante } from '../../../i18n/formatar';

import type { PedidoDeRelatorio } from '../../../api/relatorios';
import type { Relatorio } from '@pz/contracts';

const TONS: Record<Relatorio['situacao'], TomSelo> = {
  pendente: 'info',
  concluido: 'sucesso',
  falhou: 'perigo',
};

/**
 * Relatórios (HU29): a agenda de prazos pronta para gerar e os relatórios recentes do usuário,
 * com download enquanto o link vale (24 h) e "gerar novamente" depois disso.
 */
export function TelaDeRelatorios({
  inicioDoMes,
  fimDoMes,
}: {
  inicioDoMes: string;
  fimDoMes: string;
}) {
  const t = useTranslations('relatorios');
  const relatorios = useRelatorios();
  const solicitar = useSolicitarRelatorio();
  const [de, setDe] = useState<string | undefined>(inicioDoMes);
  const [ate, setAte] = useState<string | undefined>(fimDoMes);
  const [formato, setFormato] = useState<PedidoDeRelatorio['formato']>('pdf');

  const pedir = (pedido: PedidoDeRelatorio) => {
    solicitar.mutate(pedido);
  };

  const colunas: ColunaTabela<Relatorio>[] = [
    {
      id: 'tipo',
      header: t('colunas.relatorio'),
      cell: ({ row }) => t(`tipos.${row.original.tipo}`),
    },
    {
      id: 'formato',
      header: t('colunas.formato'),
      cell: ({ row }) => t(`formatos.${row.original.formato}`),
    },
    {
      id: 'solicitadoEm',
      header: t('colunas.solicitadoEm'),
      cell: ({ row }) => formatarInstante(row.original.solicitadoEm),
    },
    {
      id: 'situacao',
      header: t('colunas.situacao'),
      cell: ({ row }) => (
        <SeloStatus tom={TONS[row.original.situacao]}>
          {t(`situacoes.${row.original.situacao}`)}
          {row.original.linhas === null
            ? ''
            : ` · ${t('linhas', { quantidade: row.original.linhas })}`}
        </SeloStatus>
      ),
    },
    {
      id: 'acao',
      header: t('colunas.acao'),
      cell: ({ row }) => {
        const r = row.original;
        if (r.url !== null) {
          return (
            <a href={r.url} className="underline underline-offset-4" download>
              {t('baixar')}
            </a>
          );
        }
        if (r.situacao === 'pendente')
          return <span className="text-texto-suave">{t('gerando')}</span>;
        return (
          <Botao
            variante="secundaria"
            tamanho="sm"
            disabled={solicitar.isPending}
            onClick={() => {
              // Mesmo pedido de antes: o arquivo expirou (24 h) ou a geração falhou.
              pedir({ tipo: r.tipo, formato: r.formato, filtros: r.filtros } as PedidoDeRelatorio);
            }}
          >
            {t('gerarNovamente')}
          </Botao>
        );
      },
    },
  ];

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{t('titulo')}</h1>
        <p className="max-w-3xl text-texto-suave">{t('descricao')}</p>
      </div>

      <section aria-labelledby="agenda" className="space-y-3 rounded-lg border border-borda p-4">
        <h2 id="agenda" className="text-lg font-semibold">
          {t('tipos.agenda')}
        </h2>
        <p className="text-sm text-texto-suave">{t('agendaDescricao')}</p>
        <div className="grid items-end gap-4 sm:grid-cols-4">
          <SeletorData rotulo={t('de')} valor={de} aoMudar={setDe} />
          <SeletorData rotulo={t('ate')} valor={ate} aoMudar={setAte} />
          <Selecao
            rotulo={t('colunas.formato')}
            valor={formato}
            opcoes={(['pdf', 'xlsx'] as const).map((f) => ({
              valor: f,
              rotulo: t(`formatos.${f}`),
            }))}
            aoMudar={(f) => {
              setFormato(f as PedidoDeRelatorio['formato']);
            }}
          />
          <Botao
            disabled={de === undefined || ate === undefined || solicitar.isPending}
            onClick={() => {
              if (de !== undefined && ate !== undefined) {
                pedir({ tipo: 'agenda', formato, filtros: { de, ate } });
              }
            }}
          >
            {t('gerar')}
          </Botao>
        </div>
      </section>

      <section aria-labelledby="recentes" className="space-y-3">
        <h2 id="recentes" className="text-lg font-semibold">
          {t('recentes')}
        </h2>
        {relatorios.data === undefined ? (
          <EstadoCarregando />
        ) : relatorios.data.itens.length === 0 ? (
          <EstadoVazio titulo={t('vazio')} descricao={t('vazioDescricao')} />
        ) : (
          <TabelaDados titulo={t('recentes')} colunas={colunas} dados={relatorios.data.itens} />
        )}
      </section>
    </div>
  );
}
