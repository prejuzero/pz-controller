'use client';

import { Selecao, SeloStatus, type TomSelo } from '@pz/ui';
import { useTranslations } from 'next-intl';
import { useId } from 'react';

import { useClientes } from '../../../api/hooks';

import type { Cobertura } from '../../../api/processos';

// Fora da cobertura automática é preciso conferir o painel do tribunal (RF91, RF93).
const TOM_COBERTURA: Record<Cobertura, TomSelo> = {
  automatica: 'sucesso',
  parcial: 'alerta',
  manual: 'perigo',
};

export const COBERTURAS = Object.keys(TOM_COBERTURA) as Cobertura[];

export function SeloCobertura({ cobertura }: { cobertura: Cobertura }) {
  const t = useTranslations('processos');
  return (
    <span title={t(`coberturaAjuda.${cobertura}`)}>
      <SeloStatus tom={TOM_COBERTURA[cobertura]}>{t(`coberturas.${cobertura}`)}</SeloStatus>
    </span>
  );
}

export function SeloSigilo() {
  const t = useTranslations('processos');
  return (
    <span title={t('sigilosoAjuda')}>
      <SeloStatus tom="info">{t('sigiloso')}</SeloStatus>
    </span>
  );
}

// O Radix Select não aceita valor vazio; este marca "sem cliente".
const SEM_CLIENTE = 'nenhum';

/** Seleção do cliente do processo; `null` desvincula. */
export function CampoCliente({
  valor,
  aoMudar,
}: {
  valor: string | null;
  aoMudar: (clienteId: string | null) => void;
}) {
  const t = useTranslations('processos');
  const clientes = useClientes();
  const opcoes = [
    { valor: SEM_CLIENTE, rotulo: t('semCliente') },
    ...(clientes.data?.itens ?? []).map((cliente) => ({ valor: cliente.id, rotulo: cliente.nome })),
  ];
  return (
    <Selecao
      rotulo={t('cliente')}
      opcoes={opcoes}
      valor={valor ?? SEM_CLIENTE}
      desabilitada={clientes.data === undefined}
      aoMudar={(escolhido) => {
        aoMudar(escolhido === SEM_CLIENTE ? null : escolhido);
      }}
    />
  );
}

export function CaixaSigilo({
  marcado,
  aoMudar,
}: {
  marcado: boolean;
  aoMudar: (marcado: boolean) => void;
}) {
  const t = useTranslations('processos');
  const id = useId();
  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        type="checkbox"
        className="mt-1 size-4 accent-primaria"
        aria-describedby={`${id}-ajuda`}
        checked={marcado}
        onChange={(evento) => {
          aoMudar(evento.target.checked);
        }}
      />
      <div>
        <label htmlFor={id} className="text-sm font-medium">
          {t('sigiloso')}
        </label>
        <p id={`${id}-ajuda`} className="text-sm text-texto-suave">
          {t('sigilosoAjuda')}
        </p>
      </div>
    </div>
  );
}

/** Nome do cliente pelo id, a partir da lista já carregada. */
export function useNomeDoCliente(): (clienteId: string | null) => string {
  const clientes = useClientes();
  return (clienteId) =>
    clienteId === null
      ? '—'
      : (clientes.data?.itens.find((cliente) => cliente.id === clienteId)?.nome ?? '—');
}
