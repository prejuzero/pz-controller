'use client';

import {
  Botao,
  Campo,
  EstadoCarregando,
  EstadoVazio,
  Selecao,
  TabelaDados,
  type ColunaTabela,
} from '@pz/ui';
import { Users } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useDeferredValue, useState } from 'react';

import { useProcessos } from '../../../api/hooks';
import { SePermitido } from '../_casca/se-permitido';

import { COBERTURAS, SeloCobertura, SeloSigilo, useNomeDoCliente } from './comum';
import { NovoProcesso } from './novo-processo';

import type { Cobertura } from '../../../api/processos';
import type { ProcessoDoTenant } from '@pz/contracts';

const TODAS = 'todas';

/** Processos (HU12): lista com filtros, selos de cobertura e sigilo e cadastro pelo CNJ. */
export function Processos() {
  const t = useTranslations('processos');
  const [numero, setNumero] = useState('');
  const [cobertura, setCobertura] = useState<Cobertura | undefined>(undefined);
  // Evita uma consulta a cada tecla enquanto o número é digitado.
  const numeroAdiado = useDeferredValue(numero.replace(/\D/g, ''));
  const filtros = {
    ...(numeroAdiado === '' ? {} : { numero: numeroAdiado }),
    ...(cobertura === undefined ? {} : { cobertura }),
  };
  const processos = useProcessos(filtros);
  const nomeDoCliente = useNomeDoCliente();
  const filtrado = Object.keys(filtros).length > 0;

  const colunas: ColunaTabela<ProcessoDoTenant>[] = [
    {
      accessorKey: 'numeroCnj',
      header: t('colunas.numero'),
      cell: ({ row }) => (
        <Link
          href={`/processos/${row.original.id}`}
          className="font-medium underline underline-offset-4"
        >
          {row.original.numeroCnj}
        </Link>
      ),
    },
    {
      accessorKey: 'tribunal',
      header: t('colunas.tribunal'),
      cell: ({ row }) => row.original.tribunal ?? '—',
    },
    {
      accessorKey: 'orgao',
      header: t('colunas.orgao'),
      cell: ({ row }) => row.original.orgao ?? '—',
    },
    {
      id: 'cliente',
      header: t('colunas.cliente'),
      cell: ({ row }) => nomeDoCliente(row.original.clienteId),
    },
    {
      accessorKey: 'cobertura',
      header: t('colunas.cobertura'),
      cell: ({ row }) => (
        <span className="flex flex-wrap gap-1">
          <SeloCobertura cobertura={row.original.cobertura} />
          {row.original.sigiloso ? <SeloSigilo /> : null}
        </span>
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
        <Campo
          rotulo={t('buscar')}
          className="w-full sm:w-72"
          inputMode="numeric"
          type="search"
          value={numero}
          onChange={(evento) => {
            setNumero(evento.target.value);
          }}
        />
        <Selecao
          rotulo={t('colunas.cobertura')}
          className="w-40"
          opcoes={[
            { valor: TODAS, rotulo: t('todas') },
            ...COBERTURAS.map((valor) => ({ valor, rotulo: t(`coberturas.${valor}`) })),
          ]}
          valor={cobertura ?? TODAS}
          aoMudar={(valor) => {
            setCobertura(valor === TODAS ? undefined : (valor as Cobertura));
          }}
        />
        <div className="ms-auto flex flex-wrap gap-3">
          <Link
            href="/processos/clientes"
            className="inline-flex items-center gap-2 text-sm underline underline-offset-4"
          >
            <Users className="size-4" aria-hidden />
            {t('irClientes')}
          </Link>
          <SePermitido permissao="processos:gerir">
            <NovoProcesso />
          </SePermitido>
        </div>
      </div>
      {processos.data === undefined ? (
        <EstadoCarregando />
      ) : (
        <>
          <TabelaDados
            titulo={t('titulo')}
            colunas={colunas}
            dados={processos.data.pages.flatMap((pagina) => pagina.itens)}
            idLinha={(processo) => processo.id}
            vazio={<EstadoVazio descricao={filtrado ? t('vazioFiltro') : t('vazio')} />}
          />
          {processos.hasNextPage ? (
            <Botao
              variante="secundaria"
              carregando={processos.isFetchingNextPage}
              onClick={() => {
                void processos.fetchNextPage();
              }}
            >
              {t('carregarMais')}
            </Botao>
          ) : null}
        </>
      )}
    </div>
  );
}
