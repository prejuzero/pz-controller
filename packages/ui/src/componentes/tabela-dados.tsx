'use client';

import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { mensagens } from '../mensagens.js';

import { Botao } from './botao.js';

export type ColunaTabela<T> = ColumnDef<T>;

export interface TabelaDadosProps<T> {
  /** Nome acessível da tabela (vira o <caption>, visível só para leitores de tela). */
  titulo: string;
  colunas: ColumnDef<T>[];
  dados: T[];
  /** Linhas por página; omita para não paginar no cliente. */
  tamanhoPagina?: number | undefined;
  /** Conteúdo quando não há linhas (padrão: mensagem genérica). */
  vazio?: ReactNode;
  idLinha?: ((linha: T) => string) | undefined;
}

const ICONE_ORDEM = { asc: ArrowUp, desc: ArrowDown } as const;
const ARIA_ORDEM = { asc: 'ascending', desc: 'descending' } as const;

/** Tabela de dados (TanStack Table) com ordenação por coluna e paginação acessíveis por teclado. */
export function TabelaDados<T>({
  titulo,
  colunas,
  dados,
  tamanhoPagina,
  vazio,
  idLinha,
}: TabelaDadosProps<T>) {
  const [ordenacao, setOrdenacao] = useState<SortingState>([]);
  // eslint-disable-next-line react-hooks/incompatible-library -- useReactTable devolve funções novas a cada render por projeto da TanStack Table; o componente não é memoizado
  const tabela = useReactTable({
    data: dados,
    columns: colunas,
    state: { sorting: ordenacao },
    onSortingChange: setOrdenacao,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(tamanhoPagina === undefined
      ? {}
      : {
          getPaginationRowModel: getPaginationRowModel(),
          initialState: { pagination: { pageIndex: 0, pageSize: tamanhoPagina } },
        }),
    ...(idLinha === undefined ? {} : { getRowId: idLinha }),
  });
  const linhas = tabela.getRowModel().rows;
  return (
    <div className="grid gap-3">
      <div className="overflow-x-auto rounded-md border border-borda">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{titulo}</caption>
          <thead className="bg-superficie">
            {tabela.getHeaderGroups().map((grupo) => (
              <tr key={grupo.id}>
                {grupo.headers.map((cabecalho) => {
                  const ordem = cabecalho.column.getIsSorted();
                  const conteudo = cabecalho.isPlaceholder
                    ? null
                    : flexRender(cabecalho.column.columnDef.header, cabecalho.getContext());
                  const Icone = ordem === false ? ArrowUpDown : ICONE_ORDEM[ordem];
                  return (
                    <th
                      key={cabecalho.id}
                      scope="col"
                      aria-sort={ordem === false ? undefined : ARIA_ORDEM[ordem]}
                      className="border-b border-borda px-3 py-2 text-left font-medium text-texto-suave"
                    >
                      {cabecalho.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={cabecalho.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 rounded-sm hover:text-texto"
                        >
                          {conteudo}
                          <Icone className="size-3.5" aria-hidden />
                        </button>
                      ) : (
                        conteudo
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {linhas.length === 0 ? (
              <tr>
                <td
                  colSpan={tabela.getVisibleLeafColumns().length}
                  className="px-3 py-8 text-center text-texto-suave"
                >
                  {vazio ?? mensagens.tabela.semResultados}
                </td>
              </tr>
            ) : (
              linhas.map((linha) => (
                <tr
                  key={linha.id}
                  className="border-b border-borda last:border-b-0 hover:bg-superficie"
                >
                  {linha.getVisibleCells().map((celula) => (
                    <td key={celula.id} className="px-3 py-2 text-texto">
                      {flexRender(celula.column.columnDef.cell, celula.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {tamanhoPagina === undefined || tabela.getPageCount() <= 1 ? null : (
        <nav
          aria-label={titulo}
          className="flex items-center justify-end gap-2 text-sm text-texto-suave"
        >
          <span aria-live="polite">
            {mensagens.tabela.pagina(
              tabela.getState().pagination.pageIndex + 1,
              tabela.getPageCount(),
            )}
          </span>
          <Botao
            variante="secundaria"
            tamanho="sm"
            onClick={() => {
              tabela.previousPage();
            }}
            disabled={!tabela.getCanPreviousPage()}
          >
            {mensagens.tabela.paginaAnterior}
          </Botao>
          <Botao
            variante="secundaria"
            tamanho="sm"
            onClick={() => {
              tabela.nextPage();
            }}
            disabled={!tabela.getCanNextPage()}
          >
            {mensagens.tabela.proximaPagina}
          </Botao>
        </nav>
      )}
    </div>
  );
}
