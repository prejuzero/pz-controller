'use client';

import {
  avisar,
  Botao,
  Dialogo,
  EstadoCarregando,
  EstadoVazio,
  SeloStatus,
  TabelaDados,
  type ColunaTabela,
} from '@pz/ui';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  useAprovarVersao,
  useCadastrarTipoDeAto,
  useProporVersao,
  useSessao,
  useTiposDeAto,
  useVersoesDaTabela,
} from '../../../api/hooks';
import { agruparVersoes, diferencas, type GrupoDaTabela } from '../../../api/tabela-prazos';
import { formatarDataCivil, formatarInstante } from '../../../i18n/formatar';

import { FormularioTipoDeAto, FormularioVersao } from './formularios';

import type { VersaoDaTabela } from '@pz/contracts';

/** Curadoria da tabela de prazos (HU15): taxonomia, propostas e aprovação por quatro olhos. */
export function TabelaDePrazos() {
  const t = useTranslations('tabelaPrazos');
  const versoes = useVersoesDaTabela();
  const tipos = useTiposDeAto();
  const nomeDoAto = (codigo: string) =>
    tipos.data?.itens.find((tipo) => tipo.codigo === codigo)?.nome ?? codigo;

  const colunas: ColunaTabela<GrupoDaTabela>[] = [
    { id: 'ato', header: t('colunas.ato'), cell: ({ row }) => nomeDoAto(row.original.tipoAto) },
    { id: 'ramo', header: t('colunas.ramo'), cell: ({ row }) => t(`ramos.${row.original.ramo}`) },
    {
      id: 'ultimaAprovada',
      header: t('colunas.ultimaAprovada'),
      cell: ({ row }) => {
        const v = row.original.ultimaAprovada;
        return v === undefined ? (
          <span className="text-texto-suave">{t('nenhumaAprovada')}</span>
        ) : (
          <Prazo versao={v} />
        );
      },
    },
    {
      id: 'vigencia',
      header: t('colunas.vigencia'),
      cell: ({ row }) => {
        const v = row.original.ultimaAprovada;
        return v === undefined ? '—' : <Vigencia versao={v} />;
      },
    },
    {
      id: 'pendentes',
      header: t('colunas.pendentes'),
      cell: ({ row }) =>
        row.original.rascunhos === 0 ? (
          '—'
        ) : (
          <SeloStatus tom="alerta">{String(row.original.rascunhos)}</SeloStatus>
        ),
    },
    {
      id: 'acoes',
      header: t('colunas.acoes'),
      cell: ({ row }) => <Historico grupo={row.original} nomeDoAto={nomeDoAto} />,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{t('titulo')}</h1>
        <p className="max-w-3xl text-texto-suave">{t('descricao')}</p>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <NovoTipoDeAto />
        <NovaVersao tipos={tipos.data?.itens ?? []} />
      </div>
      {versoes.data === undefined ? (
        <EstadoCarregando />
      ) : (
        <TabelaDados
          titulo={t('titulo')}
          colunas={colunas}
          dados={agruparVersoes(versoes.data.itens)}
          tamanhoPagina={20}
          vazio={<EstadoVazio descricao={t('vazio')} />}
        />
      )}
    </div>
  );
}

function Prazo({ versao }: { versao: VersaoDaTabela }) {
  const t = useTranslations('tabelaPrazos');
  return (
    <span>
      {t('prazo', { dias: versao.dias, unidade: t(`unidades.${versao.unidade}`) })} ·{' '}
      <a
        href={versao.fonteUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="underline underline-offset-4"
      >
        {versao.fundamento}
      </a>
    </span>
  );
}

function Vigencia({ versao }: { versao: VersaoDaTabela }) {
  const t = useTranslations('tabelaPrazos');
  const inicio = formatarDataCivil(versao.vigenciaInicio);
  return versao.vigenciaFim === null
    ? t('aPartirDe', { inicio })
    : t('periodo', { inicio, fim: formatarDataCivil(versao.vigenciaFim) });
}

function Historico({
  grupo,
  nomeDoAto,
}: {
  grupo: GrupoDaTabela;
  nomeDoAto: (codigo: string) => string;
}) {
  const t = useTranslations('tabelaPrazos');
  return (
    <Dialogo
      gatilho={<Botao variante="secundaria">{t('historico')}</Botao>}
      titulo={t('historicoTitulo', {
        ato: nomeDoAto(grupo.tipoAto),
        ramo: t(`ramos.${grupo.ramo}`),
      })}
    >
      <ol className="space-y-4">
        {grupo.versoes.map((versao, i) => (
          <ItemDoHistorico key={versao.id} versao={versao} anterior={grupo.versoes[i + 1]} />
        ))}
      </ol>
    </Dialogo>
  );
}

function ItemDoHistorico({
  versao,
  anterior,
}: {
  versao: VersaoDaTabela;
  anterior: VersaoDaTabela | undefined;
}) {
  const t = useTranslations('tabelaPrazos');
  const usuarioId = useSessao().data?.usuarioId;
  const aprovar = useAprovarVersao();
  const mudancas = anterior === undefined ? undefined : diferencas(anterior, versao);
  // Quatro olhos: quem propôs não aprova (a API também recusa).
  const propria = versao.propostoPor === usuarioId;
  return (
    <li className="space-y-2 rounded-md border border-borda p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{t('versao', { numero: versao.versao })}</span>
        <SeloStatus tom={versao.status === 'aprovado' ? 'sucesso' : 'alerta'}>
          {t(`situacoes.${versao.status}`)}
        </SeloStatus>
      </div>
      <p className="text-sm">
        <Prazo versao={versao} /> · <Vigencia versao={versao} />
      </p>
      <p className="text-sm text-texto-suave">
        {versao.aprovadoEm === null
          ? t('propostoPor', { quando: formatarInstante(versao.propostoEm) })
          : t('aprovadoEm', { quando: formatarInstante(versao.aprovadoEm) })}
      </p>
      {mudancas === undefined ? (
        <p className="text-sm text-texto-suave">{t('primeiraVersao')}</p>
      ) : mudancas.length === 0 ? (
        <p className="text-sm text-texto-suave">{t('semMudancas')}</p>
      ) : (
        <ul className="list-disc ps-5 text-sm">
          {mudancas.map((m) => (
            <li key={m.campo}>
              {t('mudou', { campo: t(`diffCampos.${m.campo}`), antes: m.antes, depois: m.depois })}
            </li>
          ))}
        </ul>
      )}
      {versao.status === 'rascunho' ? (
        <div className="space-y-1">
          <Botao
            disabled={propria}
            aria-describedby={propria ? `proprio-${versao.id}` : undefined}
            carregando={aprovar.isPending}
            onClick={() => {
              aprovar.mutate(versao.id, {
                onSuccess: () => {
                  avisar.sucesso(t('aprovada'));
                },
              });
            }}
          >
            {t('aprovar')}
          </Botao>
          {propria ? (
            <p id={`proprio-${versao.id}`} className="text-sm text-texto-suave">
              {t('aprovarProprio')}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function NovoTipoDeAto() {
  const t = useTranslations('tabelaPrazos');
  const cadastrar = useCadastrarTipoDeAto();
  const [aberto, setAberto] = useState(false);
  return (
    <Dialogo
      aberto={aberto}
      aoMudarAberto={setAberto}
      gatilho={<Botao variante="secundaria">{t('novoTipo')}</Botao>}
      titulo={t('novoTipo')}
    >
      <FormularioTipoDeAto
        enviando={cadastrar.isPending}
        aoEnviar={(pedido) => {
          cadastrar.mutate(pedido, {
            onSuccess: () => {
              setAberto(false);
              avisar.sucesso(t('tipoCadastrado'));
            },
          });
        }}
      />
    </Dialogo>
  );
}

function NovaVersao({ tipos }: { tipos: readonly { codigo: string; nome: string }[] }) {
  const t = useTranslations('tabelaPrazos');
  const propor = useProporVersao();
  const [aberto, setAberto] = useState(false);
  return (
    <Dialogo
      aberto={aberto}
      aoMudarAberto={setAberto}
      gatilho={
        <Botao disabled={tipos.length === 0}>
          <Plus className="size-4" aria-hidden />
          {t('novaVersao')}
        </Botao>
      }
      titulo={t('novaVersao')}
    >
      <FormularioVersao
        tipos={tipos}
        enviando={propor.isPending}
        aoEnviar={(pedido) => {
          propor.mutate(pedido, {
            onSuccess: () => {
              setAberto(false);
              avisar.sucesso(t('proposta'));
            },
          });
        }}
      />
    </Dialogo>
  );
}
