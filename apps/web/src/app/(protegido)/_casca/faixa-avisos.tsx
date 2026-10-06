'use client';

import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useSessao } from '../../../api/hooks';
import { avisosDaSessao, type Aviso } from '../../../avisos';
import { formatarInstante } from '../../../i18n/formatar';

/** Faixa de avisos do topo: some quando não há nada a avisar. */
export function FaixaAvisos() {
  const t = useTranslations('avisos');
  const sessao = useSessao();
  const avisos = sessao.data === undefined ? [] : avisosDaSessao(sessao.data);
  if (avisos.length === 0) return null;

  const texto = (aviso: Aviso): string => {
    switch (aviso.tipo) {
      case 'impersonacao':
        return t('impersonacao', {
          motivo: aviso.motivo,
          expiraEm: formatarInstante(aviso.expiraEm),
        });
      case 'captura-atrasada':
        return t('capturaAtrasada');
      case 'ciencia-pendente':
        return t('cienciaPendente', { quantidade: aviso.quantidade });
    }
  };

  return (
    <section aria-label={t('rotulo')} className="border-b border-borda">
      <ul>
        {avisos.map((aviso) => (
          <li
            key={aviso.tipo}
            role="status"
            className="flex items-start gap-2 bg-alerta px-4 py-2 text-sm text-alerta-texto"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {texto(aviso)}
          </li>
        ))}
      </ul>
    </section>
  );
}
