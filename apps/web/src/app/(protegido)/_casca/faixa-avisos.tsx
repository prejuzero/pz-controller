'use client';

import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { useAvisosDeEntrega, useSessao, useStatusDaCaptura } from '../../../api/hooks';
import { avisosDaCaptura, avisosDaSessao, avisosDeEntrega, type Aviso } from '../../../avisos';
import { formatarInstante } from '../../../i18n/formatar';

/** Faixa de avisos do topo: some quando não há nada a avisar. */
export function FaixaAvisos() {
  const t = useTranslations('avisos');
  const sessao = useSessao();
  const entrega = useAvisosDeEntrega();
  const captura = useStatusDaCaptura();
  const avisos = [
    ...(sessao.data === undefined ? [] : avisosDaSessao(sessao.data)),
    ...(captura.data === undefined ? [] : avisosDaCaptura(captura.data)),
    ...(entrega.data === undefined ? [] : avisosDeEntrega(entrega.data)),
  ];
  if (avisos.length === 0) return null;

  const texto = (aviso: Aviso): string => {
    switch (aviso.tipo) {
      case 'impersonacao':
        return t('impersonacao', {
          motivo: aviso.motivo,
          expiraEm: formatarInstante(aviso.expiraEm),
        });
      case 'captura-atrasada':
        return aviso.desde === null
          ? t('capturaAtrasada', { fonte: aviso.fonte })
          : t('capturaAtrasadaDesde', { fonte: aviso.fonte, desde: formatarInstante(aviso.desde) });
      case 'ciencia-pendente':
        return t('cienciaPendente', { quantidade: aviso.quantidade });
      case 'email-rejeitado':
        return t('emailRejeitado', { emails: aviso.emails.join(', ') });
      case 'equipe-com-rejeicao':
        return t('equipeComRejeicao', { quantidade: aviso.quantidade });
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
            <span>
              {texto(aviso)}
              {aviso.tipo === 'captura-atrasada' && (
                <>
                  {' '}
                  <Link href="/configuracoes/cobertura" className="font-medium underline">
                    {t('capturaAtrasadaAcao')}
                  </Link>
                </>
              )}
              {aviso.tipo === 'email-rejeitado' && (
                <>
                  {' '}
                  <Link href="/configuracoes/perfil" className="font-medium underline">
                    {t('emailRejeitadoAcao')}
                  </Link>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
