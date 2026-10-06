// Dados FICTÍCIOS de teste (HU15): exercitam o mecanismo da tabela, não são regras jurídicas.
// A tabela real só entra pelo fluxo de aprovação do curador (CLAUDE.md, seção 4).
import { FixedClock, Instant, LocalDate } from '@pz/kernel';

import { VersaoDaTabela } from '../domain/tabela.js';

import type { ConteudoDaVersao, Curador } from '../domain/tabela.js';
import type { Uuid } from '@pz/kernel';

export const PLATAFORMA = '01a10e00-0000-7000-8000-0000000f0001' as Uuid;
export const ANA: Curador = {
  tenantId: PLATAFORMA,
  usuarioId: '01a10e00-0000-7000-8000-0000000f0a01' as Uuid,
};
export const BETO: Curador = {
  tenantId: PLATAFORMA,
  usuarioId: '01a10e00-0000-7000-8000-0000000f0b01' as Uuid,
};

export const relogio = () => new FixedClock(Instant.deIso('2026-10-06T12:00:00.000Z'));

export const conteudo = (parcial: Partial<ConteudoDaVersao> = {}): ConteudoDaVersao => ({
  tipoAto: 'ato-ficticio',
  ramo: 'civel',
  dias: 7,
  unidade: 'dias',
  fundamento: 'FICTÍCIO: Lei de Teste, art. 1º',
  fonteUrl: 'https://exemplo.invalid/ficticio',
  vigenciaInicio: LocalDate.de(2020, 1, 1),
  ...parcial,
});

/** Versão já aprovada (Ana propõe, Beto aprova). */
export function aprovada(parcial: Partial<ConteudoDaVersao> = {}, versao = 1): VersaoDaTabela {
  const r = relogio();
  const proposta = VersaoDaTabela.propor(conteudo(parcial), versao, ANA, r);
  if (!proposta.ok) throw proposta.erro;
  const aprovacao = proposta.valor.aprovar(BETO, r);
  if (!aprovacao.ok) throw aprovacao.erro;
  proposta.valor.retirarEventos();
  return proposta.valor;
}
