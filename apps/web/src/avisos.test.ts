import { describe, expect, it } from 'vitest';

import { avisosDaCaptura, avisosDaSessao, avisosDeEntrega } from './avisos';

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

describe('avisosDeEntrega (HU30)', () => {
  it('sem rejeição, nada; administrador sem colegas afetados, nada', () => {
    expect(avisosDeEntrega({ emailsRejeitados: [], usuariosDaEquipeComRejeicao: null })).toEqual(
      [],
    );
    expect(avisosDeEntrega({ emailsRejeitados: [], usuariosDaEquipeComRejeicao: 0 })).toEqual([]);
  });

  it('avisa os e-mails rejeitados do usuário e a equipe afetada', () => {
    expect(
      avisosDeEntrega({
        emailsRejeitados: ['ana@exemplo.invalid'],
        usuariosDaEquipeComRejeicao: 2,
      }),
    ).toEqual([
      { tipo: 'email-rejeitado', emails: ['ana@exemplo.invalid'] },
      { tipo: 'equipe-com-rejeicao', quantidade: 2 },
    ]);
  });
});

describe('avisosDaCaptura (HU19)', () => {
  const status = (situacao: 'operacional' | 'degradada') => ({
    fonte: { id: 'djen', situacao, desde: '2026-10-08T17:00:00Z' },
    oabs: [],
  });

  it('fonte operacional: nada; degradada: aviso com a fonte e o horário', () => {
    expect(avisosDaCaptura(status('operacional'))).toEqual([]);
    expect(avisosDaCaptura(status('degradada'))).toEqual([
      { tipo: 'captura-atrasada', fonte: 'DJEN', desde: '2026-10-08T17:00:00Z' },
    ]);
  });
});
