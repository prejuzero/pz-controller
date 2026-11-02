'use client';

import { Botao, EstadoCarregando } from '@pz/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { useConfirmarCienciaPeloLink, useConsultarLinkDeCiencia } from '../../../api/hooks';
import { formatarDataCivil, formatarInstante } from '../../../i18n/formatar';
import { AlertaFormulario } from '../../_acesso/alerta-formulario';

/**
 * Link de ciência do e-mail (HU33): abrir só mostra o prazo; a ciência é registrada no clique do
 * botão (varredores de link e pré-carregamento não confirmam nada).
 */
export function ConfirmacaoDeCiencia({ token }: { token: string }) {
  const t = useTranslations('ciencia');
  const consulta = useConsultarLinkDeCiencia();
  const confirmar = useConfirmarCienciaPeloLink();
  const { mutate } = consulta;
  useEffect(() => {
    mutate(token);
  }, [mutate, token]);

  if (confirmar.data !== undefined) {
    return (
      <p role="status" className="rounded-md border-l-4 border-l-sucesso bg-superficie-elevada p-3">
        {t('confirmada', { quando: formatarInstante(confirmar.data.confirmadaEm) })}
      </p>
    );
  }
  if (consulta.data === undefined) {
    return consulta.isError ? (
      <AlertaFormulario erro={consulta.error} seNaoAutorizado="linkInvalido" />
    ) : (
      <EstadoCarregando />
    );
  }
  const { situacao, prazo, confirmadaEm } = consulta.data;
  return (
    <div className="grid gap-4">
      {prazo === undefined ? null : (
        <dl className="grid gap-2 text-sm">
          <div>
            <dt className="text-texto-suave">{t('processo')}</dt>
            <dd className="font-medium">{prazo.numeroProcesso}</dd>
          </div>
          <div>
            <dt className="text-texto-suave">{t('ato')}</dt>
            <dd>{prazo.tipoAto}</dd>
          </div>
          <div>
            <dt className="text-texto-suave">{t('vencimento')}</dt>
            <dd>
              {prazo.vencimento === null ? t('semData') : formatarDataCivil(prazo.vencimento)}
            </dd>
          </div>
        </dl>
      )}
      {situacao === 'valido' ? (
        <>
          <AlertaFormulario erro={confirmar.error} seNaoAutorizado="linkInvalido" />
          <Botao
            carregando={confirmar.isPending}
            onClick={() => {
              confirmar.mutate(token);
            }}
          >
            {t('confirmar')}
          </Botao>
        </>
      ) : (
        <p
          role="alert"
          className="rounded-md border-l-4 border-l-alerta bg-superficie-elevada p-3 text-sm"
        >
          {confirmadaEm === undefined
            ? t(`situacoes.${situacao}`)
            : t('jaConfirmada', { quando: formatarInstante(confirmadaEm) })}
        </p>
      )}
      <Link href="/" className="text-sm underline underline-offset-4">
        {t('irAoPortal')}
      </Link>
    </div>
  );
}
