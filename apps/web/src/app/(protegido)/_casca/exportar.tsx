'use client';

import { avisar, Botao } from '@pz/ui';
import { useTranslations } from 'next-intl';

import { usePermissao, useSolicitarRelatorio } from '../../../api/hooks';

import type { PedidoDeRelatorio } from '../../../api/relatorios';

type Formato = PedidoDeRelatorio['formato'];

/**
 * Exportar em PDF ou Excel (HU29): pede o relatório com os filtros da tela e avisa que ele fica
 * pronto em Relatórios (erro vira aviso pelo cache global). Só com a permissão de exportar.
 */
export function BotoesExportar({ pedido }: { pedido: (formato: Formato) => PedidoDeRelatorio }) {
  const t = useTranslations('relatorios');
  const permitido = usePermissao('relatorios:exportar');
  const solicitar = useSolicitarRelatorio();
  if (permitido !== true) return null;
  const exportar = (formato: Formato) => {
    solicitar.mutate(pedido(formato), {
      onSuccess: () => {
        avisar.sucesso(t('solicitado'), t('acompanhe'));
      },
    });
  };
  return (
    <div role="group" aria-label={t('exportar')} className="flex flex-wrap gap-2">
      {(['pdf', 'xlsx'] as const).map((formato) => (
        <Botao
          key={formato}
          variante="secundaria"
          tamanho="sm"
          disabled={solicitar.isPending}
          onClick={() => {
            exportar(formato);
          }}
        >
          {t(`exportarComo.${formato}`)}
        </Botao>
      ))}
    </div>
  );
}
