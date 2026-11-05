'use client';

import { EstadoCarregando, EstadoVazio, SeloStatus, TabelaDados, type ColunaTabela } from '@pz/ui';
import { useTranslations } from 'next-intl';

import { useEnviosRecentes } from '../../../api/hooks';
import { formatarInstante } from '../../../i18n/formatar';

import type { EnviosRecentes as Envios } from '@pz/contracts';

type Envio = Envios['itens'][number];

const TOM = {
  pendente: 'neutro',
  enviado: 'sucesso',
  rejeitado: 'perigo',
  falhou: 'perigo',
} as const;
const MOTIVOS = ['bounce', 'spam', 'falha', 'destinatarios-suprimidos'] as const;

/**
 * Envios por e-mail de quem está na sessão (PZ-361): o envio é assíncrono, então quem enviou
 * acompanha aqui se chegou, foi rejeitado ou não pôde ser gerado.
 */
export function EnviosRecentes() {
  const t = useTranslations('envios');
  const envios = useEnviosRecentes();
  const motivo = (m: string | null) => {
    if (m === null) return '—';
    const conhecido = MOTIVOS.find((c) => c === m);
    return t(`motivos.${conhecido ?? 'outro'}`);
  };
  const colunas: ColunaTabela<Envio>[] = [
    {
      id: 'quando',
      header: t('colunas.quando'),
      cell: ({ row }) => formatarInstante(row.original.criadoEm),
    },
    {
      id: 'recurso',
      header: t('colunas.recurso'),
      cell: ({ row }) => t(`recursos.${row.original.recurso}`),
    },
    {
      id: 'destinatarios',
      header: t('colunas.destinatarios'),
      cell: ({ row }) => row.original.destinatarios,
    },
    {
      id: 'situacao',
      header: t('colunas.situacao'),
      cell: ({ row }) => (
        <SeloStatus tom={TOM[row.original.situacao]}>
          {t(`situacoes.${row.original.situacao}`)}
        </SeloStatus>
      ),
    },
    { id: 'motivo', header: t('colunas.motivo'), cell: ({ row }) => motivo(row.original.motivo) },
  ];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('titulo')}</h1>
      <p className="max-w-3xl text-sm text-texto-suave">{t('descricao')}</p>
      {envios.data === undefined ? (
        <EstadoCarregando />
      ) : (
        <TabelaDados
          titulo={t('tabela')}
          colunas={colunas}
          dados={envios.data.itens}
          idLinha={(e) => e.id}
          vazio={<EstadoVazio descricao={t('vazio')} />}
        />
      )}
    </div>
  );
}
