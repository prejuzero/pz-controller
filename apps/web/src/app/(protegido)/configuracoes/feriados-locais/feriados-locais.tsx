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
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  useCadastrarFeriadoLocal,
  useFeriadosLocais,
  useRevogarFeriadoLocal,
} from '../../../../api/hooks';
import { SePermitido } from '../../_casca/se-permitido';
import { descreverLocal, descreverPeriodo, SeletorAno } from '../../calendario/comum';
import { FormularioEvento } from '../../calendario/formulario-evento';

import type { FeriadoLocal } from '@pz/contracts';

// Nunca nacional: feriado nacional é do calendário global, mantido pela curadoria.
const ABRANGENCIAS = ['comarca', 'municipio', 'tribunal', 'uf'] as const;

/** Configurações > Feriados locais (HU13): feriados e suspensões só do escritório. */
export function FeriadosLocais({ anoAtual }: { anoAtual: number }) {
  const t = useTranslations('feriadosLocais');
  const tc = useTranslations('calendario');
  const [ano, setAno] = useState(anoAtual);
  const feriados = useFeriadosLocais(ano);

  const colunas: ColunaTabela<FeriadoLocal>[] = [
    {
      accessorKey: 'inicio',
      header: tc('colunas.periodo'),
      cell: ({ row }) => descreverPeriodo(row.original),
    },
    {
      accessorKey: 'abrangencia',
      header: tc('colunas.abrangencia'),
      cell: ({ row }) => tc(`abrangencias.${row.original.abrangencia}`),
    },
    { id: 'local', header: tc('colunas.local'), cell: ({ row }) => descreverLocal(row.original) },
    {
      accessorKey: 'tipo',
      header: tc('colunas.tipo'),
      cell: ({ row }) => tc(`tipos.${row.original.tipo}`),
    },
    { accessorKey: 'descricao', header: tc('colunas.descricao') },
    {
      accessorKey: 'atoNormativo',
      header: tc('colunas.ato'),
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
      id: 'acoes',
      header: tc('colunas.acoes'),
      cell: ({ row }) =>
        row.original.revogadoEm === null ? (
          <SePermitido permissao="calendario:gerir">
            <RevogarFeriado feriado={row.original} />
          </SePermitido>
        ) : (
          <SeloStatus tom="neutro">{tc('situacoes.revogado')}</SeloStatus>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{t('titulo')}</h1>
        <p className="max-w-3xl text-texto-suave">{t('descricao')}</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <SeletorAno ano={ano} anoAtual={anoAtual} aoMudar={setAno} />
        <SePermitido permissao="calendario:gerir">
          <div className="ms-auto">
            <NovoFeriado />
          </div>
        </SePermitido>
      </div>
      {feriados.data === undefined ? (
        <EstadoCarregando />
      ) : (
        <TabelaDados
          titulo={t('titulo')}
          colunas={colunas}
          dados={feriados.data.itens}
          tamanhoPagina={20}
          vazio={<EstadoVazio descricao={t('vazio')} />}
        />
      )}
    </div>
  );
}

function NovoFeriado() {
  const t = useTranslations('feriadosLocais');
  const cadastrar = useCadastrarFeriadoLocal();
  const [aberto, setAberto] = useState(false);
  return (
    <Dialogo
      aberto={aberto}
      aoMudarAberto={setAberto}
      gatilho={
        <Botao>
          <Plus className="size-4" aria-hidden />
          {t('novo')}
        </Botao>
      }
      titulo={t('novo')}
    >
      <FormularioEvento
        abrangencias={ABRANGENCIAS}
        rotuloEnviar={t('cadastrar')}
        enviando={cadastrar.isPending}
        aoEnviar={(pedido) => {
          cadastrar.mutate(pedido, {
            onSuccess: () => {
              setAberto(false);
              avisar.sucesso(t('cadastrado'));
            },
          });
        }}
      />
    </Dialogo>
  );
}

function RevogarFeriado({ feriado }: { feriado: FeriadoLocal }) {
  const t = useTranslations('feriadosLocais');
  const tc = useTranslations('calendario');
  const revogar = useRevogarFeriadoLocal();
  const [aberto, setAberto] = useState(false);
  return (
    <Dialogo
      aberto={aberto}
      aoMudarAberto={setAberto}
      gatilho={<Botao variante="secundaria">{tc('revogar')}</Botao>}
      titulo={t('revogarTitulo')}
      descricao={t('revogarDescricao')}
      acoes={
        <>
          <FecharDialogo asChild>
            <Botao variante="secundaria">{tc('cancelar')}</Botao>
          </FecharDialogo>
          <Botao
            variante="perigo"
            carregando={revogar.isPending}
            onClick={() => {
              revogar.mutate(feriado.id, {
                onSuccess: () => {
                  setAberto(false);
                  avisar.sucesso(t('revogado'));
                },
              });
            }}
          >
            {tc('revogar')}
          </Botao>
        </>
      }
    >
      <p className="text-sm">
        {descreverPeriodo(feriado)} · {feriado.descricao}
      </p>
    </Dialogo>
  );
}
