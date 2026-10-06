import { FixedClock, gerarUuidV7, Instant } from '@pz/kernel';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { contarCaracteres } from './credenciais.js';
import {
  DURACAO_DA_IMPERSONACAO_MS,
  iniciarImpersonacao,
  MOTIVO_MAXIMO,
  MOTIVO_MINIMO,
  permissoesNaImpersonacao,
  tenantEfetivo,
} from './impersonacao.js';
import { PERMISSOES, somenteLeitura } from './permissoes.js';
import { registrarUso } from './sessao.js';

import type { Sessao } from './sessao.js';

const inicio = Instant.deIso('2026-10-06T12:00:00Z');
const relogio = new FixedClock(inicio);
const PLATAFORMA = gerarUuidV7(relogio);
const ESCRITORIO = gerarUuidV7(relogio);
const sessao: Sessao = {
  id: gerarUuidV7(relogio),
  usuarioId: gerarUuidV7(relogio),
  tenantId: PLATAFORMA,
  nivel: 'completo',
  segundoFatorAtivo: true,
  criadaEm: inicio,
  ultimoUso: inicio,
};

function iniciada(): Sessao {
  const r = iniciarImpersonacao(sessao, ESCRITORIO, '  Chamado 123: conferir prazos  ', relogio);
  if (!r.ok) throw r.erro;
  return r.valor;
}

describe('impersonação (HU07)', () => {
  it('dura exatamente 60 minutos, guarda o motivo aparado e muda o tenant efetivo', () => {
    const impersonando = iniciada();
    expect(impersonando.impersonacao?.motivo).toBe('Chamado 123: conferir prazos');
    expect(impersonando.impersonacao?.expiraEm.paraIso()).toBe('2026-10-06T13:00:00.000Z');
    expect(DURACAO_DA_IMPERSONACAO_MS).toBe(60 * 60 * 1000);
    expect(tenantEfetivo(impersonando)).toBe(ESCRITORIO);
    expect(tenantEfetivo(sessao)).toBe(PLATAFORMA);
  });

  it('exige motivo entre os limites', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 600 }), (motivo) => {
        const tamanho = contarCaracteres(motivo.trim());
        const valido = tamanho >= MOTIVO_MINIMO && tamanho <= MOTIVO_MAXIMO;
        expect(iniciarImpersonacao(sessao, ESCRITORIO, motivo, relogio).ok).toBe(valido);
      }),
    );
  });

  it('recusa o próprio tenant, sessão de dispositivo, sessão sem 2FA e impersonação em curso', () => {
    const casos: [Sessao, string][] = [
      [sessao, PLATAFORMA],
      [{ ...sessao, dispositivoId: gerarUuidV7(relogio) }, ESCRITORIO],
      [{ ...sessao, nivel: 'senha' }, ESCRITORIO],
      [iniciada(), gerarUuidV7(relogio)],
    ];
    for (const [s, alvo] of casos) {
      expect(
        iniciarImpersonacao(s, alvo as typeof ESCRITORIO, 'motivo suficiente', relogio).ok,
      ).toBe(false);
    }
  });

  it('cai sozinha ao vencer: o uso da sessão depois de 60 min volta ao tenant de origem', () => {
    const impersonando = iniciada();
    const antes = registrarUso(impersonando, inicio.maisMs(DURACAO_DA_IMPERSONACAO_MS - 1));
    const depois = registrarUso(impersonando, inicio.maisMs(DURACAO_DA_IMPERSONACAO_MS));
    expect(tenantEfetivo(antes)).toBe(ESCRITORIO);
    expect(depois.impersonacao).toBeUndefined();
    expect(tenantEfetivo(depois)).toBe(PLATAFORMA);
  });

  it('só leitura, e nada se o administrador perdeu a permissão de impersonar', () => {
    const reais = new Set(['conta:gerir', 'admin:impersonar', 'admin:filas'] as const);
    expect([...permissoesNaImpersonacao(reais)].sort()).toEqual(
      [...somenteLeitura(PERMISSOES), 'admin:impersonar'].sort(),
    );
    expect(permissoesNaImpersonacao(new Set(['conta:gerir'] as const)).size).toBe(0);
  });
});
