import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { Celular, Cpf, lerUf, NumeroOab } from './valores.js';

/** Gera um CPF válido a partir de 9 dígitos (mesmo algoritmo, escrito de outro jeito). */
function cpfValido(base: number[]): string {
  const dv = (d: number[]) => {
    const soma = d.reduce((t, x, i) => t + x * (d.length + 1 - i), 0);
    return ((soma * 10) % 11) % 10;
  };
  const primeiro = dv(base);
  return [...base, primeiro, dv([...base, primeiro])].join('');
}

describe('Cpf (HU11)', () => {
  it('aceita CPF válido com ou sem máscara e guarda só dígitos', () => {
    const cpf = Cpf.de('529.982.247-25');
    expect(cpf.ok && cpf.valor.valor).toBe('52998224725');
    expect(cpf.ok && cpf.valor.mascarado()).toBe('***.982.247-**');
  });

  it.each(['529.982.247-24', '111.111.111-11', '1234567890', '', 'abc'])('recusa %s', (texto) => {
    expect(Cpf.de(texto).ok).toBe(false);
  });

  it('propriedade: todo CPF com verificadores certos e dígitos não repetidos é aceito', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 9, maxLength: 9 }),
        (base) => {
          const numero = cpfValido(base);
          fc.pre(!/^(\d)\1{10}$/.test(numero));
          expect(Cpf.de(numero).ok).toBe(true);
          const errado = `${numero.slice(0, 10)}${String((Number(numero[10]) + 1) % 10)}`;
          expect(Cpf.de(errado).ok).toBe(false);
        },
      ),
    );
  });
});

describe('UF, OAB e celular (HU11)', () => {
  it('UF das 27 seccionais, sem distinguir maiúsculas', () => {
    expect(lerUf(' sp ')).toEqual({ ok: true, valor: 'SP' });
    expect(lerUf('XX').ok).toBe(false);
  });

  it.each([
    ['123.456', '123456'],
    ['012345', '12345'],
    ['12345-a', '12345A'],
  ])('número da OAB %s → %s', (texto, esperado) => {
    const numero = NumeroOab.de(texto);
    expect(numero.ok && numero.valor.valor).toBe(esperado);
  });

  it('propriedade: número com até 6 dígitos (e letra opcional) é aceito e normalizado', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 999_999 }),
        fc.constantFrom('', 'A', 'b'),
        (n, letra) => {
          const numero = NumeroOab.de(`${String(n).padStart(6, '0')}${letra}`);
          expect(numero.ok && numero.valor.valor).toBe(`${String(n)}${letra.toUpperCase()}`);
        },
      ),
    );
    fc.assert(
      fc.property(fc.integer({ min: 1_000_000, max: 99_999_999 }), (n) => {
        expect(NumeroOab.de(String(n)).ok).toBe(false);
      }),
    );
  });

  it.each(['', 'A1', '1234567', '12AB'])('recusa OAB %s', (texto) => {
    expect(NumeroOab.de(texto).ok).toBe(false);
  });

  it('celular com DDD e nono dígito, com ou sem +55', () => {
    const celular = Celular.de('+55 (11) 98765-4321');
    expect(celular.ok && celular.valor.valor).toBe('11987654321');
    expect(Celular.de('(11) 8765-4321').ok).toBe(false);
    expect(Celular.de('(01) 98765-4321').ok).toBe(false);
  });
});
