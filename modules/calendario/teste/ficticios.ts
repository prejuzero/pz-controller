// Dados FICTÍCIOS de teste (HU13): exercitam o mecanismo do calendário, não são feriados reais.
// O calendário real só entra pelo fluxo de aprovação do curador (CLAUDE.md, seção 4).
import { FixedClock, Instant, LocalDate } from '@pz/kernel';

import type { Autor, ConteudoDoEvento } from '../domain/evento.js';
import type { Uuid } from '@pz/kernel';

export const PLATAFORMA = '01a10e00-0000-7000-8000-0000000c0001' as Uuid;
export const ESCRITORIO = '01a10e00-0000-7000-8000-0000000c0e01' as Uuid;
export const OUTRO_ESCRITORIO = '01a10e00-0000-7000-8000-0000000c0e02' as Uuid;
export const ANA: Autor = {
  tenantId: PLATAFORMA,
  usuarioId: '01a10e00-0000-7000-8000-0000000c0a01' as Uuid,
};
export const BETO: Autor = {
  tenantId: PLATAFORMA,
  usuarioId: '01a10e00-0000-7000-8000-0000000c0b01' as Uuid,
};
export const CAIO: Autor = {
  tenantId: ESCRITORIO,
  usuarioId: '01a10e00-0000-7000-8000-0000000c0c01' as Uuid,
};

export const relogio = () => new FixedClock(Instant.deIso('2026-10-06T12:00:00.000Z'));

export const conteudo = (parcial: Partial<ConteudoDoEvento> = {}): ConteudoDoEvento => ({
  abrangencia: 'nacional',
  tipo: 'feriado',
  inicio: LocalDate.de(2030, 3, 10),
  fim: LocalDate.de(2030, 3, 10),
  descricao: 'FICTÍCIO: Dia de Teste',
  atoNormativo: 'FICTÍCIO: Lei de Teste, art. 1º',
  urlAto: 'https://exemplo.invalid/ficticio',
  ...parcial,
});
