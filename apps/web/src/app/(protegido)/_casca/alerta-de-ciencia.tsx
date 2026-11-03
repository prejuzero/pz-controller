'use client';

import { avisar, Botao, Dialogo } from '@pz/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { consumirEntrada } from '../../../alerta-de-entrada';
import { useConfirmarCienciaEmLote, usePermissao, usePrazos } from '../../../api/hooks';
import { formatarDataCivil } from '../../../i18n/formatar';

const NO_ALERTA = 10;

/**
 * Alerta ao entrar (HU34, RF78): os prazos sem ciência, do vencimento mais próximo, com atalho
 * para confirmar. Não aparece sem pendências nem para quem não confirma prazos.
 */
export function AlertaDeCiencia() {
  const t = useTranslations('ciencia.alerta');
  const permitido = usePermissao('prazos:confirmar') === true;
  const [fechado, setFechado] = useState(false);
  const [acabouDeEntrar] = useState(consumirEntrada);
  const prazos = usePrazos({ recorte: 'sem-ciencia' }, permitido && acabouDeEntrar);
  const confirmar = useConfirmarCienciaEmLote();
  const itens = (prazos.data?.pages[0]?.itens ?? []).slice(0, NO_ALERTA);

  if (!permitido || !acabouDeEntrar || itens.length === 0) return null;
  return (
    <Dialogo
      aberto={!fechado}
      aoMudarAberto={(aberto) => {
        setFechado(!aberto);
      }}
      titulo={t('titulo')}
      descricao={t('descricao')}
    >
      <ul className="divide-y divide-borda rounded-md border border-borda text-sm">
        {itens.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <span>
              {p.vencimento === null ? t('semData') : formatarDataCivil(p.vencimento)} · {p.tipoAto}
            </span>
            <Link href={`/prazos/${p.id}`} className="underline underline-offset-4">
              {t('ver')}
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <Botao
          carregando={confirmar.isPending}
          onClick={() => {
            confirmar.mutate(
              itens.map((p) => p.id),
              {
                onSuccess: ({ itens: r }) => {
                  const falhas = r.filter((i) => i.situacao === 'falhou').length;
                  if (falhas === 0) avisar.sucesso(t('confirmados', { total: r.length }));
                  else avisar.erro(t('comFalhas', { falhas }));
                  setFechado(true);
                },
              },
            );
          }}
        >
          {t('confirmarListados', { total: itens.length })}
        </Botao>
        <Link
          href="/prazos?recorte=sem-ciencia"
          className="inline-flex items-center text-sm underline underline-offset-4"
          onClick={() => {
            setFechado(true);
          }}
        >
          {t('verTodos')}
        </Link>
      </div>
    </Dialogo>
  );
}
