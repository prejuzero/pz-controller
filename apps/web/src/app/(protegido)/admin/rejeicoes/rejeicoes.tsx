'use client';

import {
  Botao,
  EstadoCarregando,
  EstadoVazio,
  SeloStatus,
  TabelaDados,
  type ColunaTabela,
} from '@pz/ui';
import { useTranslations } from 'next-intl';

import { useRejeicoesDeEmail } from '../../../../api/hooks';
import { formatarInstante } from '../../../../i18n/formatar';

import type { PaginaDeRejeicoes } from '@pz/contracts';

type Rejeicao = PaginaDeRejeicoes['itens'][number];

/** E-mails que deixaram de receber envios por bounce ou spam (HU30, HU39). */
export function Rejeicoes() {
  const t = useTranslations('admin.rejeicoes');
  const rejeicoes = useRejeicoesDeEmail();
  const colunas: ColunaTabela<Rejeicao>[] = [
    { id: 'email', header: t('colunas.email'), cell: ({ row }) => row.original.email },
    {
      id: 'motivo',
      header: t('colunas.motivo'),
      cell: ({ row }) => (
        <SeloStatus tom={row.original.motivo === 'spam' ? 'perigo' : 'alerta'}>
          {t(`motivos.${row.original.motivo}`)}
        </SeloStatus>
      ),
    },
    {
      id: 'criadaEm',
      header: t('colunas.criadaEm'),
      cell: ({ row }) => formatarInstante(row.original.criadaEm),
    },
  ];
  if (rejeicoes.data === undefined) return <EstadoCarregando />;
  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-texto-suave">{t('descricao')}</p>
      <TabelaDados
        titulo={t('titulo')}
        colunas={colunas}
        dados={rejeicoes.data.pages.flatMap((pagina) => pagina.itens)}
        idLinha={(r) => r.email}
        vazio={<EstadoVazio descricao={t('vazio')} />}
      />
      {rejeicoes.hasNextPage ? (
        <Botao
          variante="secundaria"
          carregando={rejeicoes.isFetchingNextPage}
          onClick={() => {
            void rejeicoes.fetchNextPage();
          }}
        >
          {t('carregarMais')}
        </Botao>
      ) : null}
    </div>
  );
}
