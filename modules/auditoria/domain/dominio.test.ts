import { createHash } from 'node:crypto';

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { calcularHash, HASH_GENESE, verificarCadeia } from './cadeia.js';
import { jsonCanonico } from './canonico.js';

import type { RegistroDeAuditoria, RegistroEncadeado } from './cadeia.js';

const sha256 = (texto: string) => createHash('sha256').update(texto).digest('hex');

describe('JSON canônico (RFC 8785)', () => {
  it('ordena chaves, remove espaços e serializa como o ECMAScript', () => {
    expect(jsonCanonico({ b: 1, a: [true, null, 'x'], c: { z: 1e21, y: 0.1 } })).toBe(
      '{"a":[true,null,"x"],"b":1,"c":{"y":0.1,"z":1e+21}}',
    );
    expect(jsonCanonico({ '€': 1, '\u0000': 2, a: 3 })).toBe('{"\\u0000":2,"a":3,"€":1}');
    expect(jsonCanonico({ a: undefined, b: 'ção' })).toBe('{"b":"ção"}');
    expect(() => jsonCanonico({ a: Number.NaN })).toThrow();
    expect(() => jsonCanonico({ a: 1n })).toThrow();
  });

  it('propriedade: a ordem das chaves não muda o resultado', () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.jsonValue()), (objeto) => {
        const invertido = Object.fromEntries(Object.entries(objeto).reverse());
        expect(jsonCanonico(invertido)).toBe(jsonCanonico(objeto));
        expect(JSON.parse(jsonCanonico(objeto))).toEqual(JSON.parse(JSON.stringify(objeto)));
      }),
    );
  });
});

function cadeia(tamanho: number): RegistroEncadeado[] {
  const registros: RegistroEncadeado[] = [];
  let anterior = HASH_GENESE;
  for (let sequencia = 1; sequencia <= tamanho; sequencia++) {
    const registro: RegistroDeAuditoria = {
      id: `id-${String(sequencia)}`,
      tenantId: 't',
      sequencia,
      tipo: 'teste.registro',
      entidade: 'teste',
      entidadeId: String(sequencia),
      usuarioId: null,
      usuarioRealId: null,
      canal: 'sistema',
      ip: null,
      userAgent: null,
      antes: null,
      depois: { valor: sequencia },
      criadoEm: '2026-10-07T12:00:00.000Z',
    };
    const hash = calcularHash(anterior, registro, sha256);
    registros.push({ ...registro, hashAnterior: anterior, hash });
    anterior = hash;
  }
  return registros;
}

describe('cadeia de hashes', () => {
  it('cadeia íntegra é válida e informa o último elo; vazia também é válida', () => {
    expect(verificarCadeia(cadeia(5), sha256)).toMatchObject({
      valida: true,
      ultimo: { sequencia: 5 },
    });
    expect(verificarCadeia([], sha256)).toEqual({ valida: true, ultimo: undefined });
  });

  it('verificação incremental a partir de um elo conhecido', () => {
    const registros = cadeia(6);
    const ate3 = verificarCadeia(registros.slice(0, 3), sha256);
    if (!ate3.valida || ate3.ultimo === undefined) throw new Error('deveria ser válida');
    expect(verificarCadeia(registros.slice(3), sha256, ate3.ultimo).valida).toBe(true);
  });

  it('propriedade: alterar qualquer campo, remover ou trocar registros é detectado', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 7 }),
        fc.constantFrom(
          'tipo',
          'entidadeId',
          'canal',
          'depois',
          'criadoEm',
          'hash',
          'hashAnterior',
        ),
        fc.constantFrom('alterar', 'remover', 'trocar'),
        (indice, campo, acao) => {
          const registros = cadeia(8);
          const em = (i: number): RegistroEncadeado => {
            const registro = registros[i];
            if (registro === undefined) throw new Error('índice fora da cadeia');
            return registro;
          };
          if (acao === 'alterar') {
            const original = em(indice);
            registros[indice] = {
              ...original,
              [campo]:
                campo === 'depois'
                  ? { valor: -1 }
                  : `${String(original[campo as keyof RegistroEncadeado])}x`,
            };
          } else if (acao === 'remover') registros.splice(indice, 1);
          else if (indice < 7)
            [registros[indice], registros[indice + 1]] = [em(indice + 1), em(indice)];
          else registros.splice(indice, 1);
          const resultado = verificarCadeia(registros, sha256);
          // Apagar o último elo não quebra a cadeia: só a âncora externa (cabeça no WORM) revela.
          const ancora = { sequencia: 8, hash: cadeia(8)[7]?.hash };
          const detectado = !resultado.valida || resultado.ultimo?.hash !== ancora.hash;
          expect(detectado).toBe(true);
        },
      ),
    );
  });
});
