'use client';

import {
  avisar,
  Botao,
  Dialogo,
  EstadoCarregando,
  EstadoVazio,
  FecharDialogo,
  SeloStatus,
  TabelaDados,
  type ColunaTabela,
} from '@pz/ui';
import { ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';

import { useAcessos, useDispositivos, useRevogarDispositivo } from '../../../../api/hooks';
import { formatarInstante } from '../../../../i18n/formatar';

import type { AcessosRecentes, DispositivosDaConta } from '@pz/contracts';

type Acesso = AcessosRecentes['itens'][number];
type Dispositivo = DispositivosDaConta['itens'][number];

/** Configurações > Segurança (HU06): 2FA, últimos acessos e sessões ativas. */
export function Seguranca() {
  const t = useTranslations('seguranca');
  return (
    <div className="max-w-4xl space-y-8">
      <h1 className="text-2xl font-semibold">{t('titulo')}</h1>
      <Secao titulo={t('segundoFatorTitulo')}>
        <p className="flex items-start gap-2 text-sm">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t('segundoFatorAtivo')}
        </p>
      </Secao>
      <Secao titulo={t('dispositivosTitulo')}>
        <Dispositivos />
      </Secao>
      <Secao titulo={t('acessosTitulo')}>
        <Acessos />
      </Secao>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}

function Acessos() {
  const t = useTranslations('seguranca');
  const acessos = useAcessos();
  if (acessos.data === undefined) return <EstadoCarregando />;
  const colunas: ColunaTabela<Acesso>[] = [
    {
      accessorKey: 'ocorridoEm',
      header: t('quando'),
      cell: ({ row }) => formatarInstante(row.original.ocorridoEm),
    },
    {
      accessorKey: 'tipo',
      header: t('evento'),
      cell: ({ row }) => t(`tipos.${row.original.tipo}`),
    },
    {
      accessorKey: 'sucesso',
      header: t('resultado'),
      cell: ({ row }) =>
        row.original.sucesso ? (
          <SeloStatus tom="sucesso">{t('sucesso')}</SeloStatus>
        ) : (
          <SeloStatus tom="perigo">{t('falha')}</SeloStatus>
        ),
    },
    {
      accessorKey: 'ip',
      header: t('origem'),
      cell: ({ row }) => (
        <span className="block max-w-64 truncate" title={row.original.userAgent}>
          {row.original.ip} · {row.original.userAgent}
        </span>
      ),
    },
  ];
  return (
    <TabelaDados
      titulo={t('acessosTitulo')}
      colunas={colunas}
      dados={acessos.data.itens}
      tamanhoPagina={10}
      vazio={<EstadoVazio descricao={t('acessosVazio')} />}
    />
  );
}

function Dispositivos() {
  const t = useTranslations('seguranca');
  const dispositivos = useDispositivos();
  if (dispositivos.data === undefined) return <EstadoCarregando />;
  const ativos = dispositivos.data.itens.filter((item) => item.revogadaEm === null);
  if (ativos.length === 0) return <EstadoVazio descricao={t('dispositivosVazio')} />;
  return (
    <ul className="divide-y divide-borda rounded-md border border-borda">
      {ativos.map((dispositivo) => (
        <li
          key={dispositivo.id}
          className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium">{dispositivo.nome}</p>
            <p className="text-texto-suave">
              {t(`tiposCliente.${dispositivo.tipoCliente}`)} ·{' '}
              {t('ultimoUso', { quando: formatarInstante(dispositivo.ultimoUso) })}
            </p>
          </div>
          <EncerrarSessao dispositivo={dispositivo} />
        </li>
      ))}
    </ul>
  );
}

function EncerrarSessao({ dispositivo }: { dispositivo: Dispositivo }) {
  const t = useTranslations('seguranca');
  const revogar = useRevogarDispositivo();
  const [aberto, setAberto] = useState(false);
  return (
    <Dialogo
      aberto={aberto}
      aoMudarAberto={setAberto}
      gatilho={<Botao variante="secundaria">{t('encerrar')}</Botao>}
      titulo={t('encerrarTitulo', { nome: dispositivo.nome })}
      descricao={t('encerrarDescricao')}
      acoes={
        <>
          <FecharDialogo asChild>
            <Botao variante="secundaria">{t('cancelar')}</Botao>
          </FecharDialogo>
          <Botao
            variante="perigo"
            carregando={revogar.isPending}
            onClick={() => {
              revogar.mutate(dispositivo.id, {
                onSuccess: () => {
                  setAberto(false);
                  avisar.sucesso(t('encerrada'));
                },
              });
            }}
          >
            {t('encerrar')}
          </Botao>
        </>
      }
    />
  );
}
