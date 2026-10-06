import { describe, expect, it } from 'vitest';

import { avisosDaSessao } from './avisos';

describe('avisosDaSessao', () => {
  it('sem impersonação, não há aviso', () => {
    expect(avisosDaSessao({})).toEqual([]);
    expect(avisosDaSessao({ impersonacao: null })).toEqual([]);
  });

  it('mostra a impersonação em curso com motivo e validade', () => {
    const impersonacao = {
      tenantId: '01900000-0000-7000-8000-000000000001',
      motivo: 'Suporte ao chamado 42',
      expiraEm: '2026-10-06T15:00:00.000Z',
    };
    expect(avisosDaSessao({ impersonacao })).toEqual([
      { tipo: 'impersonacao', motivo: impersonacao.motivo, expiraEm: impersonacao.expiraEm },
    ]);
  });
});
