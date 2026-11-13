'use client';

import { MAXIMO_DA_APROVACAO_EM_LOTE } from '@pz/contracts';
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
              void (async () => {
                // A API aceita até 1.000 por pedido (a carga da planilha tem milhares): em blocos.
                let aprovados = 0;
                let falhas = 0;
                for (let i = 0; i < ids.length; i += MAXIMO_DA_APROVACAO_EM_LOTE) {
                  const r = await aprovar.mutateAsync(
                    ids.slice(i, i + MAXIMO_DA_APROVACAO_EM_LOTE),
                  );
                  aprovados += r.aprovados;
                  falhas += r.falhas.length;
                }
                setAberto(false);
                if (falhas === 0) avisar.sucesso(t('aprovados', { total: aprovados }));
                else avisar.erro(t('comFalhas', { total: aprovados, falhas }));
              })().catch(() => {
                // O erro do pedido já vira aviso pelo tratamento global das mutações.
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
