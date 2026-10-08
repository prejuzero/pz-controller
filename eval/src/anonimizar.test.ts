import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { anonimizar, detectarDadosIdentificaveis, suspeitasDeNome } from './anonimizar.js';

// Todos os dados abaixo são FICTÍCIOS (números sem dígito verificador válido).
describe('anonimização do teor (PZ-160)', () => {
  it.each([
    ['número CNJ', 'Processo 0000001-23.2026.8.26.0100.', 'Processo [PROCESSO].', 'numero-cnj'],
    ['número CNJ sem pontuação', 'autos 00000012320268260100', 'autos [PROCESSO]', 'numero-cnj'],
    ['OAB', 'Adv.: Fulano (OAB/SP 123.456)', 'Adv.: Fulano ([OAB])', 'oab'],
    ['OAB com estado depois', 'OAB 123456/RJ, intimado', '[OAB], intimado', 'oab'],
    [
      'endereço',
      'reside na Rua das Flores, nº 120, bairro',
      'reside na [ENDEREÇO], bairro',
      'endereco',
    ],
    ['CPF', 'CPF 123.456.789-00', 'CPF [CPF]', 'dados-pessoais'],
    ['e-mail', 'contato: fulano@exemplo.com.br', 'contato: [E-MAIL]', 'dados-pessoais'],
  ])('%s', (_caso, teor, esperado, tipo) => {
    expect(detectarDadosIdentificaveis(teor)).toEqual([tipo]);
    expect(anonimizar(teor).texto).toBe(esperado);
    expect(detectarDadosIdentificaveis(esperado)).toEqual([]);
  });

  it('nomes informados: sem diferença de acento ou caixa, palavra inteira, mesmo marcador', () => {
    const { texto } = anonimizar(
      'JOSÉ DA SILVA move ação contra Maria Souza. Jose da Silva requer; Josefa não é parte.',
      ['José da Silva', 'Maria Souza', 'Jose'],
    );
    expect(texto).toBe('[NOME 1] move ação contra [NOME 2]. [NOME 1] requer; Josefa não é parte.');
  });

  it('nome mais longo primeiro e nome vazio ignorado', () => {
    expect(
      anonimizar('Maria da Silva Souza e Maria da Silva', [
        'Maria da Silva',
        'Maria da Silva Souza',
        ' ',
      ]).texto,
    ).toBe('[NOME 2] e [NOME 1]');
  });

  it('o que parece nome e não foi informado vira suspeita; palavras do foro não', () => {
    const { texto, suspeitas } = anonimizar(
      'Ante o exposto, JULGO PROCEDENTE o pedido de Carlos Pereira contra ANA LIMA DOS REIS. ' +
        'Ministério Público e Fazenda Pública intimados. Juízo da Vara Cível.',
    );
    expect(texto).toContain('Carlos Pereira');
    expect(suspeitas).toEqual(['Carlos Pereira', 'ANA LIMA DOS REIS']);
    expect(suspeitasDeNome('Intime-se [NOME 1]. Processo [PROCESSO].')).toEqual([]);
  });

  it('propriedade: CPF, CNPJ e CNJ inseridos em qualquer texto somem', () => {
    const digitos = (n: number) =>
      fc
        .array(fc.integer({ min: 0, max: 9 }), { minLength: n, maxLength: n })
        .map((d) => d.join(''));
    const dado = fc.oneof(
      digitos(11).map((d) => `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`),
      digitos(14).map(
        (d) =>
          `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`,
      ),
      digitos(20).map(
        (d) =>
          `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16)}`,
      ),
    );
    const palavra = fc.constantFrom('Intime-se', 'a parte', 'no prazo', 'autos', ',', '.');
    fc.assert(
      fc.property(fc.array(palavra), dado, fc.array(palavra), (antes, d, depois) => {
        const teor = [...antes, d, ...depois].join(' ');
        const { texto } = anonimizar(teor);
        expect(texto).not.toContain(d);
        expect(detectarDadosIdentificaveis(texto)).toEqual([]);
      }),
    );
  });
});
