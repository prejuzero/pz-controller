import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  CATALOGO_DE_PERMISSOES,
  concede,
  ehPermissao,
  escoposOAuth,
  PERMISSOES,
  somenteLeitura,
} from './permissoes.js';

describe('catálogo de permissões (HU07)', () => {
  it('nomes no formato recurso:acao, em plural, sem repetição', () => {
    for (const permissao of PERMISSOES)
      expect(permissao).toMatch(/^[a-z]+(-[a-z]+)*:[a-z]+(-[a-z]+)*$/);
    expect(new Set(PERMISSOES).size).toBe(PERMISSOES.length);
    expect(PERMISSOES).toContain('prazos:confirmar');
  });

  it('ehPermissao aceita só o que está no catálogo', () => {
    expect(ehPermissao('prazos:ler')).toBe(true);
    expect(ehPermissao('prazos:apagar')).toBe(false);
    fc.assert(
      fc.property(fc.string(), (texto) => {
        expect(ehPermissao(texto)).toBe(Object.hasOwn(CATALOGO_DE_PERMISSOES, texto));
      }),
    );
  });

  it('exporta cada permissão como escopo OAuth com descrição (ADR-015/016)', () => {
    const escopos = escoposOAuth();
    expect(escopos.map((e) => e.escopo)).toEqual([...PERMISSOES]);
    expect(escopos.every((e) => e.descricao.length > 0)).toBe(true);
  });

  it('somenteLeitura mantém só as de leitura (impersonação nunca altera estado)', () => {
    const lidas = somenteLeitura(PERMISSOES);
    expect(lidas).toContain('prazos:ler');
    expect(lidas).not.toContain('prazos:confirmar');
    expect(lidas.every((p) => CATALOGO_DE_PERMISSOES[p].leitura)).toBe(true);
  });

  it('concede exige todas as permissões pedidas', () => {
    const tem = new Set(['prazos:ler', 'publicacoes:ler'] as const);
    expect(concede(tem, ['prazos:ler'])).toBe(true);
    expect(concede(tem, ['prazos:ler', 'prazos:confirmar'])).toBe(false);
    expect(concede(tem, [])).toBe(false);
  });
});
