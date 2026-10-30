import { FUSO_DOS_LEMBRETES } from './lembrete.js';

import type { Instant, LocalDate } from '@pz/kernel';

/** Horário padrão do resumo diário (HU31), no fuso do escritório. */
export const HORARIO_PADRAO_DO_RESUMO = '07:00';
/**
 * O job roda a cada 15 min; a tolerância cobre um ciclo perdido. A chave da notificação (um
 * resumo por usuário por dia) impede o segundo envio.
 */
export const TOLERANCIA_DO_RESUMO_MS = 30 * 60_000;

const HORARIO = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const horarioValido = (horario: string) => HORARIO.test(horario);

/** O horário do resumo de hoje já chegou, dentro da tolerância? */
export function resumoDevido(horario: string, hoje: LocalDate, agora: Instant): boolean {
  const partes = HORARIO.exec(horario);
  if (partes === null) return false;
  const instante = hoje
    .inicioNoFuso(FUSO_DOS_LEMBRETES)
    .maisMs((Number(partes[1]) * 60 + Number(partes[2])) * 60_000);
  const passou = agora.epochMs - instante.epochMs;
  return passou >= 0 && passou < TOLERANCIA_DO_RESUMO_MS;
}
