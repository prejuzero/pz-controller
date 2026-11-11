'use client';

import { avisar, Botao, Campo, EstadoCarregando } from '@pz/ui';
import { CalendarPlus, Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useAssinarAgenda, useAssinaturaDaAgenda, useRevogarAgenda } from '../../../../api/hooks';
import { ROTA_DO_ICS } from '../../../../api/relatorios';
import { formatarInstante } from '../../../../i18n/formatar';
import { AlertaFormulario } from '../../../_acesso/alerta-formulario';

import type { AssinaturaCriada } from '@pz/contracts';

/**
 * Configurações > Agenda (HU50): prazos abertos na agenda que o advogado já usa. O endereço do
 * feed é uma credencial: aparece uma vez, na criação, e pode ser revogado. O evento leva o
 * mínimo (sigilo profissional): ato, situação, número do processo e link.
 */
export function AgendaPessoal() {
  const t = useTranslations('agendaPessoal');
  const assinatura = useAssinaturaDaAgenda();
  const assinar = useAssinarAgenda();
  const revogar = useRevogarAgenda();
  const [criada, setCriada] = useState<AssinaturaCriada | null>(null);

  return (
    <div className="max-w-xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{t('titulo')}</h1>
        <p className="text-texto-suave">{t('descricao')}</p>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t('baixarTitulo')}</h2>
        <p className="text-sm text-texto-suave">{t('baixarDescricao')}</p>
        <Botao asChild variante="secundaria">
          <a href={ROTA_DO_ICS} download="prazos-prejuzero.ics">
            <Download className="size-4" aria-hidden />
            {t('baixar')}
          </a>
        </Botao>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('assinarTitulo')}</h2>
        <p className="text-sm text-texto-suave">{t('assinarDescricao')}</p>
        <AlertaFormulario
          erro={assinar.error ?? revogar.error}
          seNaoAutorizado="credenciaisInvalidas"
        />
        {assinatura.data === undefined ? (
          <EstadoCarregando />
        ) : (
          <>
            {assinatura.data.ativa && assinatura.data.criadaEm !== null ? (
              <p className="text-sm">
                {t('ativa', { quando: formatarInstante(assinatura.data.criadaEm) })}{' '}
                {assinatura.data.ultimoAcesso === null
                  ? t('nuncaLida')
                  : t('lidaEm', { quando: formatarInstante(assinatura.data.ultimoAcesso) })}
              </p>
            ) : null}
            {criada === null ? null : (
              <div role="status" className="space-y-2 rounded-md border border-alerta p-3">
                <p className="text-sm font-medium">{t('copieAgora')}</p>
                <Campo rotulo={t('endereco')} readOnly value={criada.url} />
                <div className="flex flex-wrap gap-2">
                  <Botao
                    variante="secundaria"
                    onClick={() => {
                      void navigator.clipboard.writeText(criada.url).then(() => {
                        avisar.sucesso(t('copiado'));
                      });
                    }}
                  >
                    {t('copiar')}
                  </Botao>
                  <Botao asChild variante="secundaria">
                    <a href={criada.webcal}>{t('abrirNaAgenda')}</a>
                  </Botao>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Botao
                carregando={assinar.isPending}
                onClick={() => {
                  assinar.mutate(undefined, {
                    onSuccess: (r) => {
                      setCriada(r);
                    },
                  });
                }}
              >
                <CalendarPlus className="size-4" aria-hidden />
                {assinatura.data.ativa ? t('gerarNovo') : t('gerar')}
              </Botao>
              {assinatura.data.ativa ? (
                <Botao
                  variante="perigo"
                  carregando={revogar.isPending}
                  onClick={() => {
                    revogar.mutate(undefined, {
                      onSuccess: () => {
                        setCriada(null);
                        avisar.sucesso(t('revogada'));
                      },
                    });
                  }}
                >
                  {t('revogar')}
                </Botao>
              ) : null}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
