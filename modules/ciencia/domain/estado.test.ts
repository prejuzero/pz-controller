import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { avancar, contaComoCiencia, ESTADOS_DA_CIENCIA } from './estado.js';

import type { EstadoDaCiencia } from './estado.js';

describe('máquina de estados da ciência (HU33)', () => {
  it('só avança; repetir ou voltar não muda nada', () => {
    expect(avancar('nao-enviado', 'enviado')).toBe('enviado');
    expect(avancar('entregue', 'confirmado')).toBe('confirmado');
    expect(avancar('confirmado', 'aberto')).toBe('confirmado');
    expect(avancar('cumprido', 'confirmado')).toBe('cumprido');
    expect(avancar('enviado', 'enviado')).toBe('enviado');
  });

  it('só confirmado e cumprido contam como ciência (abertura por pixel é indício)', () => {
    expect(ESTADOS_DA_CIENCIA.filter(contaComoCiencia)).toEqual(['confirmado', 'cumprido']);
  });

  it('propriedade: qualquer sequência de eventos nunca regride', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...ESTADOS_DA_CIENCIA), { maxLength: 30 }),
        (eventos) => {
          let atual: EstadoDaCiencia = 'nao-enviado';
          for (const e of eventos) {
            const proximo = avancar(atual, e);
            expect(ESTADOS_DA_CIENCIA.indexOf(proximo)).toBeGreaterThanOrEqual(
              ESTADOS_DA_CIENCIA.indexOf(atual),
            );
            atual = proximo;
          }
        },
      ),
    );
  });
});
