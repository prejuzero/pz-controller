'use client';

import { avisar, Botao, type ColunaTabela } from '@pz/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useConfirmarCienciaEmLote, usePermissao } from '../../../api/hooks';

import type { Prazo } from '@pz/contracts';

/** Teto do lote na API (HU34). */
const MAXIMO = 200;

const selecionavel = (p: Prazo) => p.statusCiencia === 'pendente' && p.status !== 'cancelado';

/**
 * Seleção em lote para "Confirmar ciência" (HU34, RF75): a coluna de marcação vai na tabela e a
 * barra mostra quantos estão marcados. Só prazos sem ciência e não cancelados podem ser marcados.
 * Só com a permissão de confirmar prazos.
 */
export function useCienciaEmLote<P extends Prazo>(prazos: readonly P[]) {
  const t = useTranslations('ciencia.lote');
  const permitido = usePermissao('prazos:confirmar') === true;
  const [marcados, setMarcados] = useState<ReadonlySet<string>>(new Set());
  const confirmar = useConfirmarCienciaEmLote();
  const elegiveis = prazos.filter(selecionavel).map((p) => p.id);
  const visiveis = elegiveis.filter((id) => marcados.has(id));
  const todos = elegiveis.length > 0 && visiveis.length === elegiveis.length;

  const alternar = (id: string, marcar: boolean) => {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (marcar) novo.add(id);
      else novo.delete(id);
      return novo;
    });
  };

  const coluna: ColunaTabela<P> = {
    id: 'selecao',
    header: () => (
      <input
        type="checkbox"
        className="size-4"
        aria-label={t('marcarTodos')}
        checked={todos}
        disabled={elegiveis.length === 0}
        onChange={(evento) => {
          setMarcados(new Set(evento.target.checked ? elegiveis.slice(0, MAXIMO) : []));
        }}
      />
    ),
    cell: ({ row }) =>
      selecionavel(row.original) ? (
        <input
          type="checkbox"
          className="size-4"
          aria-label={t('marcar', { ato: row.original.tipoAto })}
          checked={marcados.has(row.original.id)}
          onChange={(evento) => {
            alternar(row.original.id, evento.target.checked);
          }}
        />
      ) : null,
  };

  const barra =
    !permitido || elegiveis.length === 0 ? null : (
      <div role="group" aria-label={t('grupo')} className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-texto-suave" aria-live="polite">
          {t('marcados', { total: visiveis.length })}
        </span>
        <Botao
          tamanho="sm"
          disabled={visiveis.length === 0 || visiveis.length > MAXIMO}
          carregando={confirmar.isPending}
          onClick={() => {
            confirmar.mutate(visiveis, {
              onSuccess: ({ itens }) => {
                const falhas = itens.filter((i) => i.situacao === 'falhou').length;
                setMarcados(new Set());
                if (falhas === 0) avisar.sucesso(t('confirmados', { total: itens.length }));
                else
                  avisar.erro(
                    t('comFalhas', { falhas }),
                    t('comFalhasDescricao', { total: itens.length - falhas }),
                  );
              },
            });
          }}
        >
          {t('confirmar', { total: visiveis.length })}
        </Botao>
      </div>
    );

  return { coluna: permitido ? coluna : undefined, barra };
}
