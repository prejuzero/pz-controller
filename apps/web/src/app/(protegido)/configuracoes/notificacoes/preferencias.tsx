'use client';

import { avisar, Botao, Campo, EstadoCarregando } from '@pz/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  useAvisosDeEntrega,
  usePreferenciasDeNotificacao,
  useSalvarPreferencias,
} from '../../../../api/hooks';
import { AlertaFormulario } from '../../../_acesso/alerta-formulario';

import type { PreferenciasDeNotificacao } from '../../../../api/notificacoes';

/** Antecedências oferecidas, em dias úteis antes do vencimento (0 = no dia). */
const OPCOES = [10, 5, 3, 2, 1, 0] as const;
const TIPOS = ['nova-intimacao', 'lembrete-prazo', 'resumo-diario'] as const;

/**
 * Configurações > Notificações (HU31): antecedências dos lembretes, horário do resumo e tipos
 * ligados no e-mail. Os e-mails em cópia ficam no perfil. O layout já separa por canal.
 */
export function Preferencias() {
  const t = useTranslations('preferenciasDeNotificacao');
  const preferencias = usePreferenciasDeNotificacao();
  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">{t('titulo')}</h1>
      <AvisoDeSupressao />
      {preferencias.data === undefined ? (
        <EstadoCarregando />
      ) : (
        <Formulario inicial={preferencias.data} />
      )}
    </div>
  );
}

function AvisoDeSupressao() {
  const t = useTranslations('preferenciasDeNotificacao');
  const avisos = useAvisosDeEntrega();
  const rejeitados = avisos.data?.emailsRejeitados ?? [];
  if (rejeitados.length === 0) return null;
  return (
    <p
      role="alert"
      className="rounded-md border-l-4 border-l-alerta bg-superficie-elevada p-3 text-sm"
    >
      {t('suprimidos', { emails: rejeitados.join(', ') })}
    </p>
  );
}

function Formulario({ inicial }: { inicial: PreferenciasDeNotificacao }) {
  const t = useTranslations('preferenciasDeNotificacao');
  const salvar = useSalvarPreferencias();
  const [p, setP] = useState(inicial);
  const alternarAntecedencia = (n: number) => {
    setP((atual) => ({
      ...atual,
      antecedencias: atual.antecedencias.includes(n)
        ? atual.antecedencias.filter((x) => x !== n)
        : [...atual.antecedencias, n].sort((a, b) => b - a),
    }));
  };
  return (
    <form
      noValidate
      className="grid gap-6"
      onSubmit={(evento) => {
        evento.preventDefault();
        salvar.mutate(p, {
          onSuccess: () => {
            avisar.sucesso(t('salvas'));
          },
        });
      }}
    >
      <AlertaFormulario erro={salvar.error} seNaoAutorizado="credenciaisInvalidas" />
      <fieldset className="space-y-2">
        <legend className="font-medium">{t('canalEmail')}</legend>
        {TIPOS.map((tipo) => (
          <label key={tipo} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={p.ativos[tipo]}
              onChange={() => {
                setP((atual) => ({
                  ...atual,
                  ativos: { ...atual.ativos, [tipo]: !atual.ativos[tipo] },
                }));
              }}
            />
            {t(`tipos.${tipo}`)}
          </label>
        ))}
      </fieldset>
      <fieldset className="space-y-2" disabled={!p.ativos['lembrete-prazo']}>
        <legend className="font-medium">{t('antecedencias')}</legend>
        <p className="text-sm text-texto-suave">{t('ajudaAntecedencias')}</p>
        <div className="flex flex-wrap gap-4">
          {OPCOES.map((n) => (
            <label key={n} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={p.antecedencias.includes(n)}
                disabled={p.antecedencias.length === 1 && p.antecedencias.includes(n)}
                onChange={() => {
                  alternarAntecedencia(n);
                }}
              />
              {t('dias', { dias: n })}
            </label>
          ))}
        </div>
      </fieldset>
      <Campo
        rotulo={t('horarioResumo')}
        ajuda={t('ajudaHorario')}
        type="time"
        value={p.horarioResumo}
        disabled={!p.ativos['resumo-diario']}
        onChange={(evento) => {
          setP((atual) => ({ ...atual, horarioResumo: evento.target.value }));
        }}
      />
      <p className="text-sm text-texto-suave">
        {t('copias')}{' '}
        <Link href="/configuracoes/perfil" className="underline underline-offset-4">
          {t('irAoPerfil')}
        </Link>
      </p>
      <div>
        <Botao type="submit" carregando={salvar.isPending}>
          {t('salvar')}
        </Botao>
      </div>
    </form>
  );
}
