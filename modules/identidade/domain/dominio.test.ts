import { FixedClock, gerarUuidV7, Instant } from '@pz/kernel';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { contarCaracteres, normalizarEmail, validarNovaSenha } from './credenciais.js';
import {
  DURACAO_MAXIMA_MS,
  estaAtiva,
  expiracao,
  INATIVIDADE_MAXIMA_MS,
  registrarUso,
} from './sessao.js';

import type { Sessao } from './sessao.js';

const H = 3600 * 1000;
const inicio = Instant.deIso('2026-10-06T12:00:00Z');
const relogio = new FixedClock(inicio);
const sessao: Sessao = {
  id: gerarUuidV7(relogio),
  usuarioId: gerarUuidV7(relogio),
  tenantId: gerarUuidV7(relogio),
  nivel: 'senha',
  criadaEm: inicio,
  ultimoUso: inicio,
};

describe('e-mail', () => {
  it('normaliza espaços e maiúsculas e recusa formato inválido', () => {
    expect(normalizarEmail('  Advogada@Exemplo.COM ')).toEqual({
      ok: true,
      valor: 'advogada@exemplo.com',
    });
    for (const invalido of ['', 'sem-arroba', 'a@b', 'a b@c.com', `${'a'.repeat(250)}@x.com`]) {
      expect(normalizarEmail(invalido).ok).toBe(false);
    }
  });
});

describe('política de senha (ASVS V2.1)', () => {
  it('aceita de 12 a 128 caracteres Unicode, sem regras de composição', () => {
    expect(validarNovaSenha('frase longa sem números').ok).toBe(true);
    expect(validarNovaSenha('ãçéíõü😀ãçéíõü').ok).toBe(true);
    expect(validarNovaSenha('curta123!').ok).toBe(false);
    expect(validarNovaSenha('x'.repeat(129)).ok).toBe(false);
    expect(contarCaracteres('👨‍👩‍👧')).toBe(1);
  });

  it('propriedade: válida se e somente se o tamanho em grafemas está entre 12 e 128', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme', maxLength: 140 }), (senha) => {
        const tamanho = contarCaracteres(senha);
        expect(validarNovaSenha(senha).ok).toBe(tamanho >= 12 && tamanho <= 128);
      }),
    );
  });
});

describe('sessão', () => {
  it('expira após 12 h sem uso; o uso renova a janela', () => {
    expect(estaAtiva(sessao, inicio.maisMs(12 * H - 1))).toBe(true);
    expect(estaAtiva(sessao, inicio.maisMs(12 * H))).toBe(false);
    const usada = registrarUso(sessao, inicio.maisMs(11 * H));
    expect(estaAtiva(usada, inicio.maisMs(20 * H))).toBe(true);
  });

  it('nunca passa de 7 dias, mesmo com uso contínuo', () => {
    let atual = sessao;
    for (let hora = 1; hora < 7 * 24; hora++) atual = registrarUso(atual, inicio.maisMs(hora * H));
    expect(expiracao(atual)).toEqual(inicio.maisMs(DURACAO_MAXIMA_MS));
    expect(estaAtiva(atual, inicio.maisMs(DURACAO_MAXIMA_MS))).toBe(false);
  });

  it('propriedade: expiração = mínimo entre último uso + 12 h e criação + 7 dias', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: DURACAO_MAXIMA_MS }), (usoMs) => {
        const usada = registrarUso(sessao, inicio.maisMs(usoMs));
        const esperado = Math.min(usoMs + INATIVIDADE_MAXIMA_MS, DURACAO_MAXIMA_MS);
        expect(expiracao(usada).epochMs - inicio.epochMs).toBe(esperado);
      }),
    );
  });
});
