'use client';

import {
  avisar,
  Botao,
  Campo,
  Dialogo,
  EstadoCarregando,
  EstadoVazio,
  FecharDialogo,
  Selecao,
  SeloStatus,
  TabelaDados,
  type ColunaTabela,
} from '@pz/ui';
import { Plus, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  useAprovarEvento,
  useCalendarioGlobal,
  useProporEvento,
  useRevogarEvento,
  useSessao,
} from '../../../api/hooks';

import { descreverLocal, descreverPeriodo, SeletorAno } from './comum';
import { FormularioEvento } from './formulario-evento';
import { ImportacaoCsv } from './importacao-csv';

import type { EventoDoCalendario } from '@pz/contracts';

const ABRANGENCIAS = ['nacional', 'uf', 'municipio', 'tribunal', 'comarca'] as const;

/** Curadoria do calendário global (HU13): propor, aprovar (quatro olhos), revogar e importar. */
export function Curadoria({ anoAtual }: { anoAtual: number }) {
  const t = useTranslations('calendario');
  const [ano, setAno] = useState(anoAtual);
  const [abrangencia, setAbrangencia] = useState('todas');
  const eventos = useCalendarioGlobal(ano);
  const usuarioId = useSessao().data?.usuarioId;

  const itens = (eventos.data?.itens ?? []).filter(
    (evento) => abrangencia === 'todas' || evento.abrangencia === abrangencia,
  );
  const colunas: ColunaTabela<EventoDoCalendario>[] = [
    {
      accessorKey: 'inicio',
      header: t('colunas.periodo'),
      cell: ({ row }) => descreverPeriodo(row.original),
    },
    {
      accessorKey: 'abrangencia',
      header: t('colunas.abrangencia'),
      cell: ({ row }) => t(`abrangencias.${row.original.abrangencia}`),
    },
    { id: 'local', header: t('colunas.local'), cell: ({ row }) => descreverLocal(row.original) },
    {
      accessorKey: 'tipo',
      header: t('colunas.tipo'),
      cell: ({ row }) => t(`tipos.${row.original.tipo}`),
    },
    { accessorKey: 'descricao', header: t('colunas.descricao') },
    {
      accessorKey: 'atoNormativo',
      header: t('colunas.ato'),
      cell: ({ row }) => (
        <a
          href={row.original.urlAto}
          target="_blank"
          rel="noreferrer noopener"
          className="underline underline-offset-4"
        >
          {row.original.atoNormativo}
        </a>
      ),
    },
    {
      id: 'situacao',
      header: t('colunas.situacao'),
      cell: ({ row }) => <Situacao evento={row.original} />,
    },
    {
      id: 'acoes',
      header: t('colunas.acoes'),
      cell: ({ row }) => {
        const evento = row.original;
        if (evento.revogadoEm !== null) return null;
        if (evento.status === 'aprovado') return <RevogarEvento evento={evento} />;
        // Quatro olhos: quem propôs não aprova (a API também recusa).
        return evento.propostoPor === usuarioId ? null : <AprovarEvento evento={evento} />;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{t('titulo')}</h1>
        <p className="max-w-3xl text-texto-suave">{t('descricaoCuradoria')}</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <SeletorAno ano={ano} anoAtual={anoAtual} aoMudar={setAno} />
        <Selecao
          rotulo={t('filtroAbrangencia')}
          className="w-44"
          opcoes={[
            { valor: 'todas', rotulo: t('todas') },
            ...ABRANGENCIAS.map((a) => ({ valor: a, rotulo: t(`abrangencias.${a}`) })),
          ]}
          valor={abrangencia}
          aoMudar={setAbrangencia}
        />
        <div className="ms-auto flex flex-wrap gap-2">
          <ImportacaoCsv
            gatilho={
              <Botao variante="secundaria">
                <Upload className="size-4" aria-hidden />
                {t('importarCsv')}
              </Botao>
            }
          />
          <NovoEvento />
        </div>
      </div>
      {eventos.data === undefined ? (
        <EstadoCarregando />
      ) : (
        <TabelaDados
          titulo={t('titulo')}
          colunas={colunas}
          dados={itens}
          tamanhoPagina={20}
          vazio={<EstadoVazio descricao={t('vazio')} />}
        />
      )}
    </div>
  );
}

function Situacao({ evento }: { evento: EventoDoCalendario }) {
  const t = useTranslations('calendario.situacoes');
  if (evento.revogadoEm !== null) return <SeloStatus tom="neutro">{t('revogado')}</SeloStatus>;
  return evento.status === 'aprovado' ? (
    <SeloStatus tom="sucesso">{t('aprovado')}</SeloStatus>
  ) : (
    <SeloStatus tom="alerta">{t('rascunho')}</SeloStatus>
  );
}

function NovoEvento() {
  const t = useTranslations('calendario');
  const propor = useProporEvento();
  const [aberto, setAberto] = useState(false);
  return (
    <Dialogo
      aberto={aberto}
      aoMudarAberto={setAberto}
      gatilho={
        <Botao>
          <Plus className="size-4" aria-hidden />
          {t('novoEvento')}
        </Botao>
      }
      titulo={t('novoEvento')}
    >
      <FormularioEvento
        abrangencias={ABRANGENCIAS}
        rotuloEnviar={t('propor')}
        enviando={propor.isPending}
        aoEnviar={(pedido) => {
          propor.mutate(pedido, {
            onSuccess: () => {
              setAberto(false);
              avisar.sucesso(t('proposto'));
            },
          });
        }}
      />
    </Dialogo>
  );
}

function AprovarEvento({ evento }: { evento: EventoDoCalendario }) {
  const t = useTranslations('calendario');
  const aprovar = useAprovarEvento();
  const [aberto, setAberto] = useState(false);
  return (
    <Dialogo
      aberto={aberto}
      aoMudarAberto={setAberto}
      gatilho={<Botao variante="secundaria">{t('aprovar')}</Botao>}
      titulo={t('aprovarTitulo')}
      descricao={t('aprovarDescricao')}
      acoes={
        <>
          <FecharDialogo asChild>
            <Botao variante="secundaria">{t('cancelar')}</Botao>
          </FecharDialogo>
          <Botao
            carregando={aprovar.isPending}
            onClick={() => {
              aprovar.mutate(evento.id, {
                onSuccess: () => {
                  setAberto(false);
                  avisar.sucesso(t('aprovado'));
                },
              });
            }}
          >
            {t('aprovar')}
          </Botao>
        </>
      }
    >
      <p className="text-sm">
        {descreverPeriodo(evento)} · {evento.descricao} · {evento.atoNormativo}
      </p>
    </Dialogo>
  );
}

function RevogarEvento({ evento }: { evento: EventoDoCalendario }) {
  const t = useTranslations('calendario');
  const revogar = useRevogarEvento();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const valido = motivo.trim().length >= 10;
  return (
    <Dialogo
      aberto={aberto}
      aoMudarAberto={setAberto}
      gatilho={<Botao variante="secundaria">{t('revogar')}</Botao>}
      titulo={t('revogarTitulo')}
      descricao={t('revogarDescricao')}
      acoes={
        <>
          <FecharDialogo asChild>
            <Botao variante="secundaria">{t('cancelar')}</Botao>
          </FecharDialogo>
          <Botao
            variante="perigo"
            disabled={!valido}
            carregando={revogar.isPending}
            onClick={() => {
              revogar.mutate(
                { id: evento.id, motivo: motivo.trim() },
                {
                  onSuccess: () => {
                    setAberto(false);
                    avisar.sucesso(t('revogado'));
                  },
                },
              );
            }}
          >
            {t('revogar')}
          </Botao>
        </>
      }
    >
      <Campo
        rotulo={t('motivo')}
        ajuda={t('ajudaMotivo')}
        obrigatorio
        maxLength={1000}
        value={motivo}
        onChange={(e) => {
          setMotivo(e.target.value);
        }}
      />
    </Dialogo>
  );
}
