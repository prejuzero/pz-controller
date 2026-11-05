'use client';

import { avisar, Botao } from '@pz/ui';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { usePermissao, useRegistrarConferencia } from '../../../api/hooks';

/**
 * Registro da conferência de painel de um processo (HU36), na lista de conferências e no
 * detalhe do processo (PZ-355): "sem novidade" registra e avisa; "nova intimação" registra e
 * abre o cadastro do prazo no processo. Só para quem confirma prazos.
 */
export function RegistrarConferencia({ processoId }: { processoId: string }) {
  const t = useTranslations('conferencias');
  const router = useRouter();
  const registrar = useRegistrarConferencia();
  if (usePermissao('prazos:confirmar') !== true) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <Botao
        tamanho="sm"
        disabled={registrar.isPending}
        onClick={() => {
          registrar.mutate(
            { id: processoId, resultado: 'sem-novidade' },
            {
              onSuccess: () => {
                avisar.sucesso(t('registrada'));
              },
            },
          );
        }}
      >
        {t('semNovidade')}
      </Botao>
      <Botao
        tamanho="sm"
        variante="secundaria"
        disabled={registrar.isPending}
        onClick={() => {
          registrar.mutate(
            { id: processoId, resultado: 'nova-intimacao' },
            {
              onSuccess: () => {
                router.push(`/processos/${processoId}?novoPrazo=1`);
              },
            },
          );
        }}
      >
        {t('novaIntimacao')}
      </Botao>
    </div>
  );
}
