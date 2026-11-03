'use client';

import { avisar } from '@pz/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

import { usePermissao, useRelatorios } from '../../../api/hooks';

/**
 * Notificação no portal (HU29): avisa quando um relatório pedido nesta sessão fica pronto ou
 * falha. A lista só volta a ser consultada enquanto houver relatório pendente.
 */
export function AvisoDeRelatorios() {
  const t = useTranslations('relatorios');
  const permitido = usePermissao('relatorios:exportar') === true;
  const { data } = useRelatorios(permitido);
  const pendentes = useRef<Set<string> | undefined>(undefined);

  useEffect(() => {
    if (data === undefined) return;
    const anteriores = pendentes.current;
    if (anteriores !== undefined) {
      for (const r of data.itens) {
        if (!anteriores.has(r.id)) continue;
        if (r.situacao === 'concluido') avisar.sucesso(t('pronto'), t('prontoDescricao'));
        if (r.situacao === 'falhou') avisar.erro(t('falhou'), t('falhouDescricao'));
      }
    }
    pendentes.current = new Set(
      data.itens.filter((r) => r.situacao === 'pendente').map((r) => r.id),
    );
  }, [data, t]);
  return null;
}
