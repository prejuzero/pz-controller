'use client';

import { ATALHOS_DE_PERIODO } from '@pz/contracts';
import {
  Botao,
  Campo,
  EstadoCarregando,
  EstadoVazio,
  EtiquetaRemovivel,
  SeletorData,
  Selecao,
  SeloStatus,
  TabelaDados,
  type ColunaTabela,
} from '@pz/ui';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

import {
  useAtosDaTaxonomia,
  useBuscaDePrazos,
  useBuscaDePublicacoes,
  useClientes,
} from '../../../api/hooks';
import { STATUS_DO_PRAZO } from '../../../api/prazos';
import { formatarDataCivil } from '../../../i18n/formatar';

import {
  CAMPOS_DE_TEXTO,
  escreverNaUrl,
  filtrosDoRecurso,
  lerDaUrl,
  limpar,
  omitir,
  type Alteracao,
  type EstadoDaBusca,
} from './filtros-da-url';

import type { FiltrosDaTela } from '../../../api/busca';
import type { Prazo, PublicacaoDoTenant } from '@pz/contracts';

const ESPERA_MS = 400;
const RAMOS = ['civel', 'juizados', 'trabalhista', 'penal', 'juizado-criminal'] as const;
const CIENCIAS = ['pendente', 'confirmada'] as const;
const ORIGENS = ['djen', 'manual', 'painel'] as const;
const TRECHO = 140;

type Periodo = NonNullable<FiltrosDaTela['periodo']>;
type CampoDeLista = 'statusPrazo' | 'statusCiencia' | 'origem' | 'tiposAto';

/** Busca avançada (HU28): filtros combinados com E, estado na URL, etiquetas removíveis. */
export function TelaDeBusca() {
  const t = useTranslations('busca');
  const tp = useTranslations('prazos');
  const router = useRouter();
  const caminho = usePathname();
  const params = useSearchParams();
  const estado = useMemo(() => lerDaUrl(new URLSearchParams(params.toString())), [params]);
  const { recurso, filtros } = estado;
  const atos = useAtosDaTaxonomia();
  const clientes = useClientes();

  // Texto digitado vai para a URL depois de uma pausa (sem uma busca por tecla).
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  useEffect(() => {
    if (Object.keys(rascunho).length === 0) return;
    const espera = setTimeout(() => {
      const aparados = Object.fromEntries(
        Object.entries(rascunho).map(([campo, valor]) => [campo, valor.trim()]),
      );
      setRascunho({});
      navegar({ recurso, filtros: limpar<FiltrosDaTela>({ ...filtros, ...aparados }) });
    }, ESPERA_MS);
    return () => {
      clearTimeout(espera);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só o rascunho dispara a espera; filtros e recurso são lidos no momento da gravação.
  }, [rascunho]);

  function navegar(novo: EstadoDaBusca) {
    const busca = escreverNaUrl(novo).toString();
    router.replace(busca === '' ? caminho : `${caminho}?${busca}`, { scroll: false });
  }
  const mudar = (parcial: Alteracao<FiltrosDaTela>) => {
    navegar({ recurso, filtros: limpar<FiltrosDaTela>({ ...filtros, ...parcial }) });
  };
  const mudarPeriodo = (parcial: Alteracao<Periodo>) => {
    const periodo = limpar<Periodo>({ ...filtros.periodo, ...parcial });
    mudar({ periodo: Object.keys(periodo).length === 0 ? undefined : periodo });
  };
  const alternar = (campo: CampoDeLista, valor: string) => {
    const atual = filtros[campo] ?? [];
    mudar({
      [campo]: atual.includes(valor) ? atual.filter((v) => v !== valor) : [...atual, valor],
    });
  };

  const enviados = filtrosDoRecurso(estado);
  const prazos = useBuscaDePrazos(enviados, recurso === 'prazos');
  const publicacoes = useBuscaDePublicacoes(enviados, recurso === 'publicacoes');
  const atual = recurso === 'prazos' ? prazos : publicacoes;
  const primeira = atual.data?.pages[0];

  const texto = (campo: (typeof CAMPOS_DE_TEXTO)[number]) =>
    rascunho[campo] ?? filtros[campo] ?? '';
  const etiquetas = etiquetasDe(
    filtros,
    (id) => clientes.data?.itens.find((c) => c.id === id)?.nome ?? t('campos.clienteId'),
    // As chaves vêm de campos e atalhos conhecidos (catálogo `busca`); o tipo do next-intl não as infere.
    (chave, valores) => t(chave as Parameters<typeof t>[0], valores),
  );

  const colunasPrazos: ColunaTabela<Prazo>[] = [
    {
      accessorKey: 'vencimento',
      header: t('colunas.vencimento'),
      cell: ({ row }) => (
        <Link href={`/prazos/${row.original.id}`} className="underline underline-offset-4">
          {row.original.vencimento === null
            ? tp('semData')
            : formatarDataCivil(row.original.vencimento)}
        </Link>
      ),
    },
    { accessorKey: 'tipoAto', header: t('colunas.ato') },
    {
      id: 'status',
      header: t('colunas.status'),
      cell: ({ row }) => <SeloStatus tom="neutro">{tp(`abas.${row.original.status}`)}</SeloStatus>,
    },
    {
      id: 'ciencia',
      header: t('colunas.ciencia'),
      cell: ({ row }) => tp(`ciencia.${row.original.statusCiencia}`),
    },
    {
      id: 'tribunal',
      header: t('colunas.tribunal'),
      cell: ({ row }) => row.original.jurisdicao.tribunal ?? '',
    },
  ];
  const colunasPublicacoes: ColunaTabela<PublicacaoDoTenant>[] = [
    {
      accessorKey: 'dataDisponibilizacao',
      header: t('colunas.publicacao'),
      cell: ({ row }) => (
        <Link href={`/publicacoes/${row.original.id}`} className="underline underline-offset-4">
          {formatarDataCivil(row.original.dataDisponibilizacao)}
        </Link>
      ),
    },
    { accessorKey: 'siglaTribunal', header: t('colunas.tribunal') },
    {
      id: 'teor',
      header: t('colunas.teor'),
      cell: ({ row }) =>
        row.original.teor.length > TRECHO
          ? `${row.original.teor.slice(0, TRECHO)}…`
          : row.original.teor,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{t('titulo')}</h1>
        <p className="max-w-3xl text-texto-suave">{t('descricao')}</p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label={t('oQueBuscar')}>
        {(['prazos', 'publicacoes'] as const).map((r) => (
          <Botao
            key={r}
            variante={r === recurso ? 'primaria' : 'secundaria'}
            aria-pressed={r === recurso}
            onClick={() => {
              navegar({ recurso: r, filtros });
            }}
          >
            {t(`recursos.${r}`)}
          </Botao>
        ))}
      </div>

      <section className="space-y-3" aria-labelledby="periodo">
        <h2 id="periodo" className="text-lg font-semibold">
          {t('periodo')}
        </h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('atalhos')}>
          {ATALHOS_DE_PERIODO.filter((a) => recurso === 'prazos' || a !== 'vencidos').map((a) => (
            <Botao
              key={a}
              tamanho="sm"
              variante={filtros.periodo?.atalho === a ? 'primaria' : 'secundaria'}
              aria-pressed={filtros.periodo?.atalho === a}
              onClick={() => {
                mudarPeriodo(
                  filtros.periodo?.atalho === a
                    ? { atalho: undefined }
                    : { atalho: a, de: undefined, ate: undefined },
                );
              }}
            >
              {t(`atalhosDePeriodo.${a}`)}
            </Botao>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <SeletorData
            rotulo={t('de')}
            valor={filtros.periodo?.de}
            aoMudar={(de) => {
              mudarPeriodo({ de, atalho: undefined });
            }}
          />
          <SeletorData
            rotulo={t('ate')}
            valor={filtros.periodo?.ate}
            aoMudar={(ate) => {
              mudarPeriodo({ ate, atalho: undefined });
            }}
          />
          {recurso === 'prazos' ? (
            <Selecao
              rotulo={t('dataAlvo')}
              valor={filtros.periodo?.campoData ?? 'vencimento'}
              opcoes={(['vencimento', 'inicio'] as const).map((c) => ({
                valor: c,
                rotulo: t(`datasAlvo.${c}`),
              }))}
              aoMudar={(campoData) => {
                mudarPeriodo({ campoData: campoData as Periodo['campoData'] });
              }}
            />
          ) : null}
        </div>
      </section>

      <details className="rounded-lg border border-borda p-4" open={etiquetas.length > 0}>
        <summary className="cursor-pointer font-semibold">{t('avancada')}</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CAMPOS_DE_TEXTO.map((campo) => (
            <Campo
              key={campo}
              rotulo={t(`campos.${campo}`)}
              value={texto(campo)}
              onChange={(evento) => {
                setRascunho((r) => ({ ...r, [campo]: evento.target.value }));
              }}
            />
          ))}
          <Selecao
            rotulo={t('campos.clienteId')}
            valor={filtros.clienteId ?? ''}
            opcoes={[
              { valor: '', rotulo: t('todos') },
              ...(clientes.data?.itens ?? []).map((c) => ({ valor: c.id, rotulo: c.nome })),
            ]}
            aoMudar={(clienteId) => {
              mudar({ clienteId: clienteId === '' ? undefined : clienteId });
            }}
          />
          {recurso === 'prazos' ? (
            <>
              <Selecao
                rotulo={t('campos.ramo')}
                valor={filtros.ramo ?? ''}
                opcoes={[
                  { valor: '', rotulo: t('todos') },
                  ...RAMOS.map((r) => ({ valor: r, rotulo: t(`ramos.${r}`) })),
                ]}
                aoMudar={(ramo) => {
                  mudar({ ramo: ramo === '' ? undefined : (ramo as (typeof RAMOS)[number]) });
                }}
              />
              <Selecao
                rotulo={t('campos.tiposAto')}
                valor={filtros.tiposAto?.[0] ?? ''}
                opcoes={[
                  { valor: '', rotulo: t('todos') },
                  ...(atos.data?.itens ?? []).map((a) => ({ valor: a.codigo, rotulo: a.nome })),
                ]}
                aoMudar={(ato) => {
                  mudar({ tiposAto: ato === '' ? undefined : [ato] });
                }}
              />
            </>
          ) : null}
        </div>
        {recurso === 'prazos' ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Opcoes
              titulo={t('campos.statusPrazo')}
              valores={STATUS_DO_PRAZO}
              marcados={filtros.statusPrazo ?? []}
              rotulo={(v) => tp(`abas.${v}`)}
              aoAlternar={(v) => {
                alternar('statusPrazo', v);
              }}
            />
            <Opcoes
              titulo={t('campos.statusCiencia')}
              valores={CIENCIAS}
              marcados={filtros.statusCiencia ?? []}
              rotulo={(v) => tp(`ciencia.${v}`)}
              aoAlternar={(v) => {
                alternar('statusCiencia', v);
              }}
            />
            <Opcoes
              titulo={t('campos.origem')}
              valores={ORIGENS}
              marcados={filtros.origem ?? []}
              rotulo={(v) => tp(`origem.${v}`)}
              aoAlternar={(v) => {
                alternar('origem', v);
              }}
            />
          </div>
        ) : null}
      </details>

      {etiquetas.length === 0 ? null : (
        <div className="flex flex-wrap items-center gap-2" aria-label={t('filtrosAtivos')}>
          {etiquetas.map((e) => (
            <EtiquetaRemovivel
              key={e.chave}
              rotulo={e.rotulo}
              aoRemover={() => {
                navegar({ recurso, filtros: e.remover(filtros) });
              }}
            />
          ))}
          <Botao
            variante="secundaria"
            tamanho="sm"
            onClick={() => {
              navegar({ recurso, filtros: {} });
            }}
          >
            {t('limpar')}
          </Botao>
        </div>
      )}

      <section className="space-y-3" aria-labelledby="resultados">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="resultados" className="text-lg font-semibold" aria-live="polite">
            {primeira === undefined
              ? t('resultados')
              : primeira.totalLimitado
                ? t('maisDe', { total: primeira.totalAproximado })
                : t('total', { total: primeira.totalAproximado })}
          </h2>
          <Botao
            variante="secundaria"
            tamanho="sm"
            onClick={() => {
              const padrao = recurso === 'prazos' ? 'asc' : 'desc';
              const ordem = filtros.ordem ?? padrao;
              mudar({ ordem: ordem === 'asc' ? 'desc' : 'asc' });
            }}
          >
            {t(
              (filtros.ordem ?? (recurso === 'prazos' ? 'asc' : 'desc')) === 'asc'
                ? 'ordemAsc'
                : 'ordemDesc',
            )}
          </Botao>
        </div>
        {atual.isError ? (
          <EstadoVazio descricao={t('erro')} />
        ) : atual.data === undefined ? (
          <EstadoCarregando />
        ) : recurso === 'prazos' ? (
          <TabelaDados
            titulo={t('recursos.prazos')}
            colunas={colunasPrazos}
            dados={prazos.data?.pages.flatMap((p) => p.itens) ?? []}
            idLinha={(p) => p.id}
            vazio={<EstadoVazio descricao={t('vazio')} />}
          />
        ) : (
          <TabelaDados
            titulo={t('recursos.publicacoes')}
            colunas={colunasPublicacoes}
            dados={publicacoes.data?.pages.flatMap((p) => p.itens) ?? []}
            idLinha={(p) => p.id}
            vazio={<EstadoVazio descricao={t('vazio')} />}
          />
        )}
        {atual.hasNextPage ? (
          <Botao
            variante="secundaria"
            carregando={atual.isFetchingNextPage}
            onClick={() => {
              void atual.fetchNextPage();
            }}
          >
            {t('carregarMais')}
          </Botao>
        ) : null}
      </section>
    </div>
  );
}

function Opcoes<T extends string>({
  titulo,
  valores,
  marcados,
  rotulo,
  aoAlternar,
}: {
  titulo: string;
  valores: readonly T[];
  marcados: readonly string[];
  rotulo: (valor: T) => string;
  aoAlternar: (valor: T) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{titulo}</legend>
      {valores.map((v) => (
        <label key={v} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={marcados.includes(v)}
            onChange={() => {
              aoAlternar(v);
            }}
            className="size-4"
          />
          {rotulo(v)}
        </label>
      ))}
    </fieldset>
  );
}

interface Etiqueta {
  readonly chave: string;
  readonly rotulo: string;
  readonly remover: (filtros: FiltrosDaTela) => FiltrosDaTela;
}

/** Uma etiqueta por filtro ativo (RF50); remover tira só aquele valor. */
function etiquetasDe(
  filtros: FiltrosDaTela,
  nomeDoCliente: (id: string) => string,
  t: (chave: string, valores?: Record<string, string>) => string,
): Etiqueta[] {
  const sem = (campo: string) => (f: FiltrosDaTela) => omitir(f, [campo]);
  const lista: Etiqueta[] = [];
  for (const [campo, valor] of Object.entries(filtros)) {
    if (campo === 'periodo' || campo === 'ordem') continue;
    if (Array.isArray(valor)) {
      for (const item of valor as string[]) {
        lista.push({
          chave: `${campo}-${item}`,
          rotulo: `${t(`campos.${campo}`)}: ${item}`,
          remover: (f) => {
            const resto = ((f as Record<string, unknown>)[campo] as string[]).filter(
              (v) => v !== item,
            );
            return limpar<FiltrosDaTela>({ ...f, [campo]: resto });
          },
        });
      }
    } else {
      const texto = typeof valor === 'string' ? valor : '';
      const exibido = campo === 'clienteId' ? nomeDoCliente(texto) : texto;
      lista.push({
        chave: campo,
        rotulo: `${t(`campos.${campo}`)}: ${exibido}`,
        remover: sem(campo),
      });
    }
  }
  const p = filtros.periodo;
  if (p?.atalho !== undefined) {
    lista.push({
      chave: 'atalho',
      rotulo: t(`atalhosDePeriodo.${p.atalho}`),
      remover: sem('periodo'),
    });
  } else if (p?.de !== undefined || p?.ate !== undefined) {
    lista.push({
      chave: 'intervalo',
      rotulo: t('intervalo', {
        de: p.de === undefined ? '…' : formatarDataCivil(p.de),
        ate: p.ate === undefined ? '…' : formatarDataCivil(p.ate),
      }),
      remover: sem('periodo'),
    });
  }
  return lista;
}
