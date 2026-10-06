'use client';

import { Botao, EstadoCarregando } from '@pz/ui';
import { useTranslations } from 'next-intl';

import { useSair, useSessao } from '../../api/hooks';
import { ROTA_ENTRAR } from '../../rotas';

// Página provisória: o layout autenticado e a navegação chegam no PZ-166.
export default function Inicio() {
  const t = useTranslations('inicio');
  const sessao = useSessao();
  const sair = useSair();

  if (sessao.isPending) return <EstadoCarregando />;
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">{t('titulo')}</h1>
      <Botao
        variante="secundaria"
        carregando={sair.isPending}
        onClick={() => {
          sair.mutate(undefined, {
            onSuccess: () => {
              window.location.assign(ROTA_ENTRAR);
            },
          });
        }}
      >
        {t('sair')}
      </Botao>
    </main>
  );
}
