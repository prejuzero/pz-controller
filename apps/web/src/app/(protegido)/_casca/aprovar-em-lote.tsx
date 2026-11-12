'use client';

import { avisar, Botao, Dialogo, FecharDialogo } from '@pz/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { UseMutationResult } from '@tanstack/react-query';

interface Resultado {
  aprovados: number;
  falhas: readonly { id: string; codigo: string }[];
}

/**
 * Aprovação de todos os rascunhos de uma vez (carga da planilha da curadoria): a API aprova cada
 * um na própria transação e registra cada aprovação na trilha. Só aparece se houver rascunho.
 */
export function AprovarEmLote({
  ids,
  aprovar,
}: {
  ids: readonly string[];
  aprovar: UseMutationResult<Resultado, Error, string[]>;
}) {
  const t = useTranslations('aprovarEmLote');
  const [aberto, setAberto] = useState(false);
  if (ids.length === 0) return null;
  return (
    <Dialogo
      aberto={aberto}
      aoMudarAberto={setAberto}
      gatilho={<Botao>{t('botao', { total: ids.length })}</Botao>}
      titulo={t('titulo')}
      descricao={t('descricao', { total: ids.length })}
      acoes={
        <>
          <FecharDialogo asChild>
            <Botao variante="secundaria">{t('cancelar')}</Botao>
          </FecharDialogo>
          <Botao
            carregando={aprovar.isPending}
            onClick={() => {
              aprovar.mutate([...ids], {
                onSuccess: (r) => {
                  setAberto(false);
                  if (r.falhas.length === 0) avisar.sucesso(t('aprovados', { total: r.aprovados }));
                  else avisar.erro(t('comFalhas', { total: r.aprovados, falhas: r.falhas.length }));
                },
              });
            }}
          >
            {t('confirmar')}
          </Botao>
        </>
      }
    />
  );
}
