import { describe, expect, it } from 'vitest';

import { dadoPessoal, substituirDadosPessoais } from './dados-pessoais.js';

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
