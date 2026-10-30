import { describe, expect, it } from 'vitest';

import { escreverNaUrl, filtrosDoRecurso, lerDaUrl } from './filtros-da-url';

describe('filtros da busca na URL (HU28, RF50)', () => {
  it('lê e escreve ida e volta, com listas e período', () => {
    const url = new URLSearchParams(
      'recurso=publicacoes&numeroCnj=0000001&palavraChave=senten%C3%A7a&statusPrazo=pendente,vencido&atalho=hoje&campoData=inicio&ramo=civel&ordem=desc&vazio=',
    );
    const estado = lerDaUrl(url);
    expect(estado).toEqual({
      recurso: 'publicacoes',
      filtros: {
        numeroCnj: '0000001',
        palavraChave: 'sentença',
        statusPrazo: ['pendente', 'vencido'],
        ramo: 'civel',
        ordem: 'desc',
        periodo: { atalho: 'hoje', campoData: 'inicio' },
      },
    });
    expect(lerDaUrl(escreverNaUrl(estado))).toEqual(estado);
    expect(escreverNaUrl({ recurso: 'prazos', filtros: { tiposAto: [] } }).toString()).toBe('');
    expect(lerDaUrl(new URLSearchParams())).toEqual({ recurso: 'prazos', filtros: {} });
  });

  it('publicações não recebem filtros só de prazo e usam a data de publicação', () => {
    const filtros = {
      palavraChave: 'x',
      statusPrazo: ['pendente' as const],
      ramo: 'civel' as const,
      periodo: { atalho: 'hoje' as const, campoData: 'vencimento' as const },
    };
    expect(filtrosDoRecurso({ recurso: 'publicacoes', filtros })).toEqual({
      palavraChave: 'x',
      periodo: { atalho: 'hoje', campoData: 'publicacao' },
    });
    expect(filtrosDoRecurso({ recurso: 'prazos', filtros })).toBe(filtros);
    expect(filtrosDoRecurso({ recurso: 'publicacoes', filtros: { oab: 'GO1' } })).toEqual({
      oab: 'GO1',
    });
  });
});

describe('utilitários de filtros', () => {
  it('omitir e limpar não alteram o original', async () => {
    const { limpar, omitir } = await import('./filtros-da-url');
    const original = { a: 1, b: '', c: [], d: undefined, e: ['x'] };
    expect(omitir(original, ['a', 'e'])).toEqual({ b: '', c: [], d: undefined });
    expect(limpar(original)).toEqual({ a: 1, e: ['x'] });
    expect(original.a).toBe(1);
  });
});
