import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { dadoPessoal, marcarDadosPessoais, substituirDadosPessoais } from './dados-pessoais.js';

describe('dados pessoais fora do hash (ADR-018)', () => {
  it('troca cada marcador pela referência, em qualquer profundidade, sem tocar no resto', () => {
    const vistos: string[] = [];
    const trocado = substituirDadosPessoais(
      {
        nome: dadoPessoal('Pessoa Fictícia'),
        contatos: [dadoPessoal('a@exemplo.invalid'), 'público'],
        tipo: 'cliente',
        numero: 7,
        vazio: null,
      },
      (valor) => {
        vistos.push(valor);
        return `ref-${String(vistos.length)}`;
      },
    );
    expect(vistos).toEqual(['Pessoa Fictícia', 'a@exemplo.invalid']);
    expect(trocado).toEqual({
      nome: { $dadoPessoal: 'ref-1' },
      contatos: [{ $dadoPessoal: 'ref-2' }, 'público'],
      tipo: 'cliente',
      numero: 7,
      vazio: null,
    });
  });

  it('sem marcador, devolve o mesmo valor', () => {
    const valor = { a: 1, b: ['x'] };
    expect(substituirDadosPessoais(valor, () => 'nunca')).toEqual(valor);
    expect(substituirDadosPessoais(undefined, () => 'nunca')).toBeUndefined();
  });
});

// Dados FICTÍCIOS. Rede de proteção (PZ-305): o que tem cara de dado pessoal sai do hash mesmo
// que o emissor esqueça de marcar, para poder ser pseudonimizado na LGPD.
describe('marcação automática de dados pessoais na trilha (ADR-018, PZ-305)', () => {
  it('marca e-mail, CPF e CNPJ em qualquer campo e profundidade, com ou sem máscara', () => {
    expect(
      marcarDadosPessoais(
        {
          motivo: 'fulana@exemplo.invalid',
          documento2: '123.456.789-09',
          lista: ['12345678909', '12.345.678/0001-95', 'ok'],
          aninhado: { cnpj: '12345678000195' },
        },
        'prazo',
      ),
    ).toEqual({
      motivo: dadoPessoal('fulana@exemplo.invalid'),
      documento2: dadoPessoal('123.456.789-09'),
      lista: [dadoPessoal('12345678909'), dadoPessoal('12.345.678/0001-95'), 'ok'],
      aninhado: { cnpj: dadoPessoal('12345678000195') },
    });
  });

  it('marca as chaves pessoais (email, cpf, documento, telefone, celular) de qualquer entidade', () => {
    expect(
      marcarDadosPessoais(
        { email: 'x', cpf: 'y', documento: 'z', telefone: '62', celular: '9', outro: 'w' },
        'envio',
      ),
    ).toEqual({
      email: dadoPessoal('x'),
      cpf: dadoPessoal('y'),
      documento: dadoPessoal('z'),
      telefone: dadoPessoal('62'),
      celular: dadoPessoal('9'),
      outro: 'w',
    });
  });

  it('nome só é pessoal em entidade de pessoa (o nome do tipo de ato não é)', () => {
    for (const entidade of ['usuario', 'advogado', 'cliente', 'tenant'])
      expect(marcarDadosPessoais({ nome: 'Fulana Fictícia' }, entidade)).toEqual({
        nome: dadoPessoal('Fulana Fictícia'),
      });
    expect(marcarDadosPessoais({ nome: 'Contestação' }, 'tipo_ato')).toEqual({
      nome: 'Contestação',
    });
  });

  it('não mexe no que não é pessoal: OAB, número CNJ, datas, ids, números e nulos', () => {
    const valor = {
      oab: '063977',
      numeroCnj: '00012342026826010000',
      vencimento: '2026-11-10',
      id: '01a10e00-0000-7000-8000-0000000a0001',
      dias: 15,
      ativo: true,
      nada: null,
    };
    expect(marcarDadosPessoais(valor, 'processo')).toEqual(valor);
  });

  it('valor já marcado fica como está; marcar duas vezes não muda nada (idempotente)', () => {
    fc.assert(
      fc.property(fc.jsonValue(), fc.constantFrom('usuario', 'prazo'), (valor, entidade) => {
        const uma = marcarDadosPessoais(valor, entidade);
        expect(marcarDadosPessoais(uma, entidade)).toEqual(uma);
      }),
    );
    expect(marcarDadosPessoais({ email: dadoPessoal('a@b.invalid') }, 'usuario')).toEqual({
      email: dadoPessoal('a@b.invalid'),
    });
  });

  it('chave pessoal com valor não textual (nulo, número) não vira marcador', () => {
    expect(marcarDadosPessoais({ email: null, telefone: 62 }, 'usuario')).toEqual({
      email: null,
      telefone: 62,
    });
  });
});
