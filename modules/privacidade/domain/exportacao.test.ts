import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { paraCsv, paraJson } from './exportacao.js';

// Dados FICTÍCIOS.
const secoes = [
  { nome: 'conta', linhas: [{ nome: 'Pessoa "Fictícia", Silva', email: 'a@exemplo.invalid' }] },
  {
    nome: 'oabs',
    linhas: [
      { numero: '123456', uf: 'SP' },
      { numero: '7', uf: 'RJ', extra: true },
    ],
  },
  { nome: 'vazia', linhas: [] },
];

describe('arquivos da exportação (HU38)', () => {
  it('JSON com metadados e uma chave por seção', () => {
    expect(
      JSON.parse(paraJson(secoes, { escopo: 'titular', geradoEm: '2026-10-07T12:00:00.000Z' })),
    ).toEqual({
      escopo: 'titular',
      geradoEm: '2026-10-07T12:00:00.000Z',
      secoes: {
        conta: [{ nome: 'Pessoa "Fictícia", Silva', email: 'a@exemplo.invalid' }],
        oabs: [
          { numero: '123456', uf: 'SP' },
          { numero: '7', uf: 'RJ', extra: true },
        ],
        vazia: [],
      },
    });
  });

  it('CSV por seção, com cabeçalho das colunas e escape RFC 4180', () => {
    expect(paraCsv(secoes)).toBe(
      [
        '# conta',
        'nome,email',
        '"Pessoa ""Fictícia"", Silva",a@exemplo.invalid',
        '',
        '# oabs',
        'numero,uf,extra',
        '123456,SP,',
        '7,RJ,true',
        '',
        '# vazia',
        '',
        '',
      ].join('\r\n'),
    );
  });

  it('propriedade: célula com vírgula, aspas ou quebra sempre vai entre aspas e volta igual', () => {
    fc.assert(
      fc.property(fc.string(), (texto) => {
        const linha = paraCsv([{ nome: 's', linhas: [{ c: texto }] }]).split('\r\n')[2] ?? '';
        if (/[",\r\n]/.test(texto)) {
          expect(linha.startsWith('"')).toBe(true);
          expect(linha.slice(1, -1).replaceAll('""', '"')).toBe(texto);
        }
      }),
    );
  });
});
