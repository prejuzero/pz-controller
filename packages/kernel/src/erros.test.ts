import { describe, expect, it } from 'vitest';

import {
  Conflito,
  ErroDominio,
  NaoEncontrado,
  Proibido,
  RegraDeNegocio,
  Validacao,
} from './erros.js';

describe('erros de domínio', () => {
  it('cada tipo tem categoria, código estável e mensagem em português', () => {
    const casos = [
      [new NaoEncontrado('prazo.nao-encontrado', 'Prazo não encontrado.'), 'nao-encontrado'],
      [new Conflito('prazo.ja-confirmado', 'O prazo já foi confirmado.'), 'conflito'],
      [new Proibido('acesso.negado', 'Sem permissão para confirmar prazos.'), 'proibido'],
      [
        new RegraDeNegocio('prazo.sem-regra-legal', 'Sem regra legal cadastrada para este ato.'),
        'regra-de-negocio',
      ],
      [new Validacao([{ campo: 'cnj', mensagem: 'Número CNJ inválido.' }]), 'validacao'],
    ] as const;

    for (const [erro, categoria] of casos) {
      expect(erro).toBeInstanceOf(ErroDominio);
      expect(erro).toBeInstanceOf(Error);
      expect(erro.categoria).toBe(categoria);
      expect(erro.name).toBe(erro.constructor.name);
      expect(erro.message.length).toBeGreaterThan(0);
    }
  });

  it('Validacao lista os problemas por campo', () => {
    const erro = new Validacao([
      { campo: 'cnj', mensagem: 'Número CNJ inválido.' },
      { campo: 'oab', mensagem: 'Inscrição OAB obrigatória.' },
    ]);
    expect(erro.codigo).toBe('validacao');
    expect(erro.problemas).toHaveLength(2);
    expect(erro.message).toBe('Dados inválidos: cnj, oab.');
    expect(new Validacao([], 'data.invalida', 'Data inválida.').codigo).toBe('data.invalida');
  });

  it('preserva a causa', () => {
    const causa = new Error('origem');
    expect(new Conflito('x', 'y', { cause: causa }).cause).toBe(causa);
  });
});
