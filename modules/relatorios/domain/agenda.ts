import type { EventoDeAgenda } from './ics.js';
import type { LocalDate } from '@pz/kernel';

/** Prazo aberto como a agenda precisa (HU50): o vencimento vem do motor, pronto. */
export interface PrazoDaAgenda {
  readonly id: string;
  readonly vencimento: LocalDate;
  readonly status: 'pendente' | 'a-confirmar';
  readonly nomeDoAto: string;
  /** Com a máscara do CNJ. */
  readonly numeroCnj: string;
  readonly sigiloso: boolean;
}

const dataBr = (d: LocalDate) =>
  `${String(d.dia).padStart(2, '0')}/${String(d.mes).padStart(2, '0')}/${String(d.ano)}`;

/**
 * Evento do prazo na agenda pessoal (HU50; decisão do usuário em 09/11/2026). A agenda fica em
 * servidores de terceiros: só o mínimo (ato, situação, número do processo e link), nada de partes,
 * teor ou cliente (sigilo profissional, CLAUDE.md seção 14); processo sigiloso, nem isso.
 */
export function eventoDoPrazo(prazo: PrazoDaAgenda, portalUrl: string): EventoDeAgenda {
  const aConfirmar = prazo.status === 'a-confirmar';
  const titulo = prazo.sigiloso
    ? 'Prazo (processo sigiloso)'
    : `Prazo: ${prazo.nomeDoAto}${aConfirmar ? ' (a confirmar)' : ''} · ${prazo.numeroCnj}`;
  // O sistema sugere, o advogado decide (CLAUDE.md, seção 2): a agenda repete o aviso.
  const descricao = `Vence em ${dataBr(prazo.vencimento)} (24h no horário do juízo).${
    aConfirmar
      ? ' Data sugerida pelo motor de prazos do PrejuZero: só vale depois de confirmada no portal.'
      : ''
  }`;
  return {
    uid: `${prazo.id}@prejuzero`,
    data: prazo.vencimento,
    titulo,
    descricao,
    url: `${portalUrl.replace(/\/$/, '')}/prazos/${prazo.id}`,
  };
}
