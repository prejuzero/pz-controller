'use client';

import {
  avisar,
  Botao,
  classesEntrada,
  cn,
  EnvoltorioCampo,
  EstadoCarregando,
  EstadoVazio,
  SeloStatus,
  TabelaDados,
  type ColunaTabela,
} from '@pz/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  useCasosCandidatos,
  useDecidirCaso,
  useExportarCasos,
  useRevisaoManual,
} from '../../../api/hooks';
import { formatarInstante } from '../../../i18n/formatar';
import { AlertaFormulario } from '../../_acesso/alerta-formulario';

import type { CasoCandidato, PaginaDaRevisaoManual } from '@pz/contracts';

type ItemDaRevisao = PaginaDaRevisaoManual['itens'][number];

/** Mínimo do motivo da decisão, o mesmo do contrato (PedidoDeDecisaoDoCaso). */
const MOTIVO_MINIMO = 10;

/**
 * Curadoria da classificação (PZ-336): a fila de revisão manual (HU21) e os casos candidatos ao
 * conjunto de avaliação vindos das correções dos advogados (HU22). A regra fica na API.
 */
export function CuradoriaDaClassificacao() {
  const t = useTranslations('curadoriaDaClassificacao');
  return (
    <section className="space-y-8" aria-labelledby="curadoria-da-classificacao">
      <div className="space-y-2">
        <h2 id="curadoria-da-classificacao" className="text-xl font-semibold">
          {t('titulo')}
        </h2>
        <p className="max-w-3xl text-sm text-texto-suave">{t('descricao')}</p>
      </div>
      <RevisaoManual />
      <CasosCandidatos />
    </section>
  );
}

function RevisaoManual() {
  const t = useTranslations('curadoriaDaClassificacao');
  const fila = useRevisaoManual();
  const colunas: ColunaTabela<ItemDaRevisao>[] = [
    {
      id: 'criadaEm',
      header: t('colunas.criadaEm'),
      cell: ({ row }) => formatarInstante(row.original.criadaEm),
    },
    {
      id: 'motivo',
      header: t('colunas.motivo'),
      cell: ({ row }) => t(`motivos.${row.original.motivo ?? 'outro'}`),
    },
    {
      id: 'sugestao',
      header: t('colunas.sugestao'),
      cell: ({ row }) =>
        row.original.tipoAto === null
          ? t('semSugestao')
          : `${row.original.tipoAto} (${String(row.original.confianca ?? '-')})`,
    },
    {
      id: 'evidencia',
      header: t('colunas.evidencia'),
      cell: ({ row }) => (
        <span className="text-xs">{row.original.evidencias[0]?.trecho ?? t('semEvidencia')}</span>
      ),
    },
  ];
  return (
    <div className="space-y-3">
      <h3 className="font-semibold">{t('revisao.titulo')}</h3>
      <p className="max-w-3xl text-sm text-texto-suave">{t('revisao.descricao')}</p>
      {fila.data === undefined ? (
        <EstadoCarregando />
      ) : (
        <TabelaDados
          titulo={t('revisao.titulo')}
          colunas={colunas}
          dados={fila.data.itens}
          idLinha={(i) => i.conteudoId}
          vazio={<EstadoVazio descricao={t('revisao.vazio')} />}
        />
      )}
    </div>
  );
}

function CasosCandidatos() {
  const t = useTranslations('curadoriaDaClassificacao');
  const casos = useCasosCandidatos();
  const exportar = useExportarCasos();
  const [aberto, setAberto] = useState<CasoCandidato | undefined>(undefined);
  const colunas: ColunaTabela<CasoCandidato>[] = [
    {
      id: 'teor',
      header: t('colunas.teor'),
      cell: ({ row }) => (
        <span className="line-clamp-2 text-xs">{row.original.teorAnonimizado}</span>
      ),
    },
    {
      id: 'ato',
      header: t('colunas.ato'),
      cell: ({ row }) =>
        `${row.original.tipoAtoClassificado ?? t('semSugestao')} → ${row.original.tipoAtoCorrigido}`,
    },
    {
      id: 'dias',
      header: t('colunas.dias'),
      cell: ({ row }) =>
        `${String(row.original.diasCitados ?? '-')} → ${String(row.original.diasCorrigidos ?? '-')}`,
    },
    {
      id: 'acoes',
      header: t('colunas.acoes'),
      cell: ({ row }) => (
        <Botao
          variante="secundaria"
          onClick={() => {
            setAberto(row.original);
          }}
        >
          {t('conferir')}
        </Botao>
      ),
    },
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{t('candidatos.titulo')}</h3>
        <Botao
          variante="secundaria"
          carregando={exportar.isPending}
          onClick={() => {
            exportar.mutate(undefined, {
              onSuccess: (dados) => {
                baixarJson(dados.casos, 'casos-aceitos.json');
              },
            });
          }}
        >
          {t('exportar')}
        </Botao>
      </div>
      <p className="max-w-3xl text-sm text-texto-suave">{t('candidatos.descricao')}</p>
      {casos.data === undefined ? (
        <EstadoCarregando />
      ) : (
        <TabelaDados
          titulo={t('candidatos.titulo')}
          colunas={colunas}
          dados={casos.data.itens}
          idLinha={(c) => c.id}
          vazio={<EstadoVazio descricao={t('candidatos.vazio')} />}
        />
      )}
      {aberto === undefined ? null : (
        <DecisaoDoCaso
          key={aberto.id}
          caso={aberto}
          aoConcluir={() => {
            setAberto(undefined);
          }}
        />
      )}
    </div>
  );
}

function DecisaoDoCaso({ caso, aoConcluir }: { caso: CasoCandidato; aoConcluir: () => void }) {
  const t = useTranslations('curadoriaDaClassificacao');
  const decidir = useDecidirCaso();
  const [teor, setTeor] = useState(caso.teorAnonimizado);
  const [motivo, setMotivo] = useState('');
  const curto = motivo.trim().length < MOTIVO_MINIMO;
  const enviar = (decisao: 'aceitar' | 'descartar') => {
    decidir.mutate(
      {
        id: caso.id,
        pedido: {
          decisao,
          motivo: motivo.trim(),
          ...(teor === caso.teorAnonimizado ? {} : { teorAnonimizado: teor }),
        },
      },
      {
        onSuccess: () => {
          avisar.sucesso(t(decisao === 'aceitar' ? 'aceito' : 'descartado'));
          aoConcluir();
        },
      },
    );
  };
  return (
    <form
      method="post"
      noValidate
      className="grid max-w-3xl gap-3 rounded-md border border-borda p-3"
      aria-label={t('decisao.titulo')}
      onSubmit={(e) => {
        e.preventDefault();
      }}
    >
      <div className="flex items-center gap-2">
        <h4 className="font-semibold">{t('decisao.titulo')}</h4>
        <SeloStatus tom="alerta">{t('decisao.anonimizado')}</SeloStatus>
      </div>
      <AlertaFormulario erro={decidir.error} seNaoAutorizado="credenciaisInvalidas" />
      <EnvoltorioCampo rotulo={t('decisao.teor')} ajuda={t('decisao.teorAjuda')}>
        {({ id, descricao, invalido }) => (
          <textarea
            id={id}
            aria-describedby={descricao}
            aria-invalid={invalido}
            rows={8}
            className={cn(classesEntrada, 'h-auto py-2 text-sm')}
            value={teor}
            onChange={(e) => {
              setTeor(e.target.value);
            }}
          />
        )}
      </EnvoltorioCampo>
      <EnvoltorioCampo rotulo={t('decisao.motivo')} ajuda={t('decisao.motivoAjuda')} obrigatorio>
        {({ id, descricao, invalido }) => (
          <textarea
            id={id}
            aria-describedby={descricao}
            aria-invalid={invalido}
            rows={2}
            className={cn(classesEntrada, 'h-auto py-2 text-sm')}
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
            }}
          />
        )}
      </EnvoltorioCampo>
      <div className="flex flex-wrap justify-end gap-2">
        <Botao variante="secundaria" type="button" onClick={aoConcluir}>
          {t('decisao.fechar')}
        </Botao>
        <Botao
          variante="perigo"
          type="button"
          disabled={curto}
          carregando={decidir.isPending}
          onClick={() => {
            enviar('descartar');
          }}
        >
          {t('decisao.descartar')}
        </Botao>
        <Botao
          type="button"
          disabled={curto}
          carregando={decidir.isPending}
          onClick={() => {
            enviar('aceitar');
          }}
        >
          {t('decisao.aceitar')}
        </Botao>
      </div>
    </form>
  );
}

/** Baixa os casos como arquivo JSON, sem sair da página. */
function baixarJson(dados: unknown, nome: string) {
  const url = URL.createObjectURL(
    new Blob([`${JSON.stringify(dados, null, 2)}\n`], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  link.click();
  URL.revokeObjectURL(url);
}
