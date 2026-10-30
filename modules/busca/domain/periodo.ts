import { DiaDaSemana, LocalDate } from '@pz/kernel';

/** Atalhos de período da busca (RF45); o "hoje" vem do servidor, no fuso de São Paulo. */
export const ATALHOS = [
  'hoje',
  'amanha',
  'esta-semana',
  'proxima-semana',
  'este-mes',
  'proximos-30-dias',
  'vencidos',
] as const;
export type Atalho = (typeof ATALHOS)[number];

export interface Intervalo {
  readonly de?: LocalDate;
  readonly ate?: LocalDate;
}

/** Segunda-feira da semana de `dia` (semana de segunda a domingo). */
function segunda(dia: LocalDate): LocalDate {
  const semana = dia.diaDaSemana();
  return dia.maisDias(semana === DiaDaSemana.domingo ? -6 : DiaDaSemana.segunda - semana);
}

/**
 * Intervalo de datas (inclusive) de um atalho. É filtro de consulta, não cálculo de prazo: as
 * datas dos prazos continuam vindo só do motor.
 */
export function resolverAtalho(atalho: Atalho, hoje: LocalDate): Intervalo {
  switch (atalho) {
    case 'hoje':
      return { de: hoje, ate: hoje };
    case 'amanha':
      return { de: hoje.maisDias(1), ate: hoje.maisDias(1) };
    case 'esta-semana':
      return { de: segunda(hoje), ate: segunda(hoje).maisDias(6) };
    case 'proxima-semana':
      return { de: segunda(hoje).maisDias(7), ate: segunda(hoje).maisDias(13) };
    case 'este-mes': {
      const primeiro = LocalDate.de(hoje.ano, hoje.mes, 1);
      const seguinte =
        hoje.mes === 12
          ? LocalDate.de(hoje.ano + 1, 1, 1)
          : LocalDate.de(hoje.ano, hoje.mes + 1, 1);
      return { de: primeiro, ate: seguinte.maisDias(-1) };
    }
    case 'proximos-30-dias':
      return { de: hoje, ate: hoje.maisDias(30) };
    case 'vencidos':
      return { ate: hoje.maisDias(-1) };
  }
}
