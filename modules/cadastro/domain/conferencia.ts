import type { Cobertura } from './processo.js';
import type { LocalDate } from '@pz/kernel';

/**
 * Conferência de painel (HU36, RF91–RF93). Quando a intimação vai ao portal do tribunal e não
 * ao DJEN, a ciência é tácita após 10 dias corridos da disponibilização (Lei 11.419, art. 5º,
 * §3º). Processo sigiloso ou fora da cobertura automática precisa de conferência periódica,
 * sempre antes desse prazo. A periodicidade é um lembrete, não uma data de prazo.
 */
export const PERIODICIDADE_PADRAO = 5;
/** Lei 11.419, art. 5º, §3º: a conferência fica abaixo dos 10 dias corridos. */
export const MAXIMO_DIAS_DA_CONFERENCIA = 9;

export const RESULTADOS_DA_CONFERENCIA = ['sem-novidade', 'nova-intimacao'] as const;
export type ResultadoDaConferencia = (typeof RESULTADOS_DA_CONFERENCIA)[number];

export function exigeConferencia(p: { cobertura: Cobertura; sigiloso: boolean }): boolean {
  return p.sigiloso || p.cobertura !== 'automatica';
}

export interface SituacaoDaConferencia {
  /** Data da próxima conferência (dia civil em Brasília). */
  readonly proxima: string;
  /** Passou do dia devido sem conferência. */
  readonly atrasada: boolean;
  /** Hoje é um dia de lembrete: o devido e, depois, a cada período (insistência). */
  readonly lembrarHoje: boolean;
}

/**
 * Situação a partir da referência (última conferência ou, sem nenhuma, o dia em que o processo
 * passou a exigir). Dias corridos: lembrar mais cedo que 5 dias úteis, nunca depois.
 */
export function situacaoDaConferencia(
  referencia: LocalDate,
  hoje: LocalDate,
  periodicidade: number,
): SituacaoDaConferencia {
  const dias = referencia.diasAte(hoje);
  return {
    proxima: referencia.maisDias(periodicidade).paraIso(),
    atrasada: dias > periodicidade,
    lembrarHoje: dias > 0 && dias % periodicidade === 0,
  };
}
