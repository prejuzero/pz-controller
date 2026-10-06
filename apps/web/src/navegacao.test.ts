import { describe, expect, it } from 'vitest';

import { ITENS_BARRA_INFERIOR, ITENS_MENU, itemAtivo, secaoDoSegmento } from './navegacao';

describe('navegacao', () => {
  it('segue a ordem do menu da especificação (seção 2.12)', () => {
    expect(ITENS_MENU.map((item) => item.chave)).toEqual([
      'dashboard',
      'prazos',
      'publicacoes',
      'busca',
      'processos',
      'calendario',
      'relatorios',
      'configuracoes',
    ]);
    expect(ITENS_BARRA_INFERIOR.map((item) => item.chave)).toEqual([
      'dashboard',
      'prazos',
      'publicacoes',
      'busca',
    ]);
  });

  it('marca o item ativo pelo prefixo, sem confundir seções parecidas', () => {
    expect(itemAtivo('/', '/')).toBe(true);
    expect(itemAtivo('/prazos', '/')).toBe(false);
    expect(itemAtivo('/prazos', '/prazos')).toBe(true);
    expect(itemAtivo('/prazos/123', '/prazos')).toBe(true);
    expect(itemAtivo('/prazosx', '/prazos')).toBe(false);
  });

  it('resolve a seção pelo segmento e recusa o que não está no menu', () => {
    expect(secaoDoSegmento('calendario')?.chave).toBe('calendario');
    expect(secaoDoSegmento('')).toBeUndefined();
    expect(secaoDoSegmento('admin')).toBeUndefined();
  });

  it('exige a permissão de leitura das seções protegidas pela API (HU07)', () => {
    expect(secaoDoSegmento('prazos')).toMatchObject({ permissao: 'prazos:ler' });
    expect(secaoDoSegmento('publicacoes')).toMatchObject({ permissao: 'publicacoes:ler' });
    expect(secaoDoSegmento('calendario')).toMatchObject({ permissao: 'calendario:ler' });
    expect(secaoDoSegmento('configuracoes')).not.toHaveProperty('permissao');
  });
});
