import type { Instant, LocalDate } from '@pz/kernel';

/** Antecedências padrão (HU31): 5, 2 e 1 dia útil antes e no dia do vencimento. */
export const ANTECEDENCIAS_PADRAO: readonly number[] = [5, 2, 1, 0];
export const MAXIMO_DE_ANTECEDENCIAS = 6;
export const MAIOR_ANTECEDENCIA = 30;
/** Fuso dos lembretes: o horário do escritório, não o do juízo (o fim do prazo é do motor). */
export const FUSO_DOS_LEMBRETES = 'America/Sao_Paulo';
const HORA_DO_LEMBRETE = 8;
/** Insistência (RF77): segundo aviso à tarde nos dois últimos dias úteis, sem ciência. */
const HORA_DA_INSISTENCIA = 14;
export const ANTECEDENCIAS_DA_INSISTENCIA: readonly number[] = [1, 0];

const HORA_MS = 3_600_000;

export type TipoDeLembrete = 'antecedencia' | 'insistencia';

export interface LembretePlanejado {
  readonly tipo: TipoDeLembrete;
  readonly antecedencia: number;
  readonly vencimento: LocalDate;
  readonly disparoEm: Instant;
}

/**
 * Agenda de um prazo: um lembrete às 8h de cada data escolhida e, nos dois últimos dias úteis,
 * a insistência às 14h (cancelada no disparo se a ciência já foi confirmada). As datas vêm do
 * motor; aqui só entram os horários. O que já passou fica de fora.
 */
export function planejarLembretes(p: {
  readonly vencimento: LocalDate;
  readonly datas: readonly { readonly antecedencia: number; readonly data: LocalDate }[];
  readonly escolhidas: readonly number[];
  readonly agora: Instant;
}): LembretePlanejado[] {
  const em = (data: LocalDate, hora: number) =>
    data.inicioNoFuso(FUSO_DOS_LEMBRETES).maisMs(hora * HORA_MS);
  const lembretes: LembretePlanejado[] = [];
  for (const { antecedencia, data } of p.datas) {
    if (p.escolhidas.includes(antecedencia)) {
      lembretes.push({
        tipo: 'antecedencia',
        antecedencia,
        vencimento: p.vencimento,
        disparoEm: em(data, HORA_DO_LEMBRETE),
      });
    }
    if (ANTECEDENCIAS_DA_INSISTENCIA.includes(antecedencia)) {
      lembretes.push({
        tipo: 'insistencia',
        antecedencia,
        vencimento: p.vencimento,
        disparoEm: em(data, HORA_DA_INSISTENCIA),
      });
    }
  }
  return lembretes
    .filter((l) => l.disparoEm.epochMs > p.agora.epochMs)
    .sort((a, b) => a.disparoEm.epochMs - b.disparoEm.epochMs);
}

/** Antecedências válidas, sem repetição, da maior para a menor. */
export function normalizarAntecedencias(valores: readonly number[]): number[] {
  return [...new Set(valores)].sort((a, b) => b - a);
}
