'use client';

import { EstadoCarregando } from '@pz/ui';
import { useTranslations } from 'next-intl';

import { useVerificacaoDoHistorico } from '../../../api/hooks';
import { formatarInstante } from '../../../i18n/formatar';
import { AlertaFormulario } from '../../_acesso/alerta-formulario';

/**
 * Verificação pública do PDF do histórico (HU35): confere o trecho contra a trilha e mostra só o
 * necessário para comparar com o PDF (sequência, data, evento e hash), sem o conteúdo.
 */
export function VerificacaoDoHistorico({ codigo }: { codigo: string }) {
  const t = useTranslations('verificacao');
  const verificacao = useVerificacaoDoHistorico(codigo);
  if (verificacao.data === undefined) {
    return verificacao.isError ? (
      <AlertaFormulario erro={verificacao.error} seNaoAutorizado="linkInvalido" />
    ) : (
      <EstadoCarregando />
    );
  }
  const v = verificacao.data;
  if (v.situacao === 'inexistente') {
    return (
      <p role="alert" className="rounded-md border-l-4 border-l-perigo bg-superficie-elevada p-3">
        {t('inexistente')}
      </p>
    );
  }
  if (v.situacao === 'divergente') {
    return (
      <p role="alert" className="rounded-md border-l-4 border-l-perigo bg-superficie-elevada p-3">
        {t('divergente', { motivo: v.motivo })}
      </p>
    );
  }
  return (
    <div className="grid gap-4">
      <p role="status" className="rounded-md border-l-4 border-l-sucesso bg-superficie-elevada p-3">
        {t('valido', { quando: formatarInstante(v.emitidaEm), total: v.eventos.length })}
      </p>
      <p className="text-sm text-texto-suave">{t('compare')}</p>
      <ol className="grid gap-2 text-sm">
        {v.eventos.map((e) => (
          <li key={e.sequencia}>
            <span className="font-medium">
              {String(e.sequencia)} · {formatarInstante(e.criadoEm)}
            </span>
            <span className="block break-all font-mono text-xs text-texto-suave">{e.hash}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
