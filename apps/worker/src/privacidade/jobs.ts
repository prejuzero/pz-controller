import { z } from 'zod';

import { definirAgendamento } from '../filas/agendamento.js';
import { definirJob } from '../filas/job.js';

import type { Agendamento } from '../filas/agendamento.js';

/** Efetivação dos encerramentos vencidos (HU38): global, papel sistema, uma vez por dia. */
export const efetivarEncerramentosJob = definirJob({
  fila: 'manutencao',
  tipo: 'privacidade.efetivar-encerramentos',
  dados: z.object({}).strict(),
  global: true,
});

export const AGENDAMENTO_DOS_ENCERRAMENTOS: Agendamento<unknown> = definirAgendamento({
  id: 'privacidade.efetivar-encerramentos',
  job: efetivarEncerramentosJob,
  cron: '30 2 * * *', // diário às 2h30, fora do expediente
  dados: {},
  motivo: 'efetivação dos encerramentos de conta vencidos (LGPD, carência de 30 dias)',
});

/** Retenção diária (HU38): provas de encerrados antigos e registros de acesso antigos. */
export const aplicarRetencaoJob = definirJob({
  fila: 'manutencao',
  tipo: 'privacidade.aplicar-retencao',
  dados: z.object({}).strict(),
  global: true,
});

export const AGENDAMENTO_DA_RETENCAO: Agendamento<unknown> = definirAgendamento({
  id: 'privacidade.aplicar-retencao',
  job: aplicarRetencaoJob,
  cron: '30 3 * * *', // diário às 3h30, depois da limpeza do outbox
  dados: {},
  motivo: 'retenção LGPD: acessos e provas pseudonimizadas vencidos',
});
