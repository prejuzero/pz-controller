import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { classeProcessualCanonica } from './classe-processual.js';

describe('classe processual canônica', () => {
  it('tira acentos, junta espaços e põe em maiúsculas (como o DJEN manda, irregular)', () => {
    expect(classeProcessualCanonica('PROCEDIMENTO COMUM CíVEL')).toBe('PROCEDIMENTO COMUM CIVEL');
    expect(classeProcessualCanonica('  Procedimento do Juizado   Especial Cível ')).toBe(
      'PROCEDIMENTO DO JUIZADO ESPECIAL CIVEL',
    );
    expect(classeProcessualCanonica('REINTEGRAçãO / MANUTENçãO DE POSSE')).toBe(
      'REINTEGRACAO / MANUTENCAO DE POSSE',
    );
    expect(classeProcessualCanonica(' x ')).toBeUndefined();
    expect(classeProcessualCanonica('A'.repeat(201))).toBeUndefined();
  });

  it('propriedade: idempotente', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 3, maxLength: 60 }), (texto) => {
        const uma = classeProcessualCanonica(texto);
        if (uma !== undefined) expect(classeProcessualCanonica(uma)).toBe(uma);
      }),
    );
  });
});
