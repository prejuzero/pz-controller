import { describe, expect, it } from 'vitest';

import {
  ErroCredencialInvalida,
  ErroIntegracao,
  ErroLimiteExcedido,
  ErroPermanente,
  ErroTransitorio,
} from './erros.js';

describe('erros classificados de integração', () => {
  it('a classe decide retentativa e degradação', () => {
    const casos = [
      [new ErroTransitorio('5xx', 'djen'), 'transitorio', true, true],
      [new ErroPermanente('404', 'djen'), 'permanente', false, false],
      [new ErroLimiteExcedido('429', 'djen'), 'limite-excedido', true, false],
      [new ErroCredencialInvalida('401', 'djen'), 'credencial-invalida', false, true],
    ] as const;
    for (const [erro, tipo, retentavel, degrada] of casos) {
      expect(erro).toBeInstanceOf(ErroIntegracao);
      expect([erro.tipo, erro.retentavel, erro.indicaDegradacao]).toEqual([
        tipo,
        retentavel,
        degrada,
      ]);
      expect(erro.adaptador).toBe('djen');
    }
  });

  it('guarda o nome da classe, a causa e o tempo sugerido pelo provedor', () => {
    const causa = new Error('ECONNRESET');
    const erro = new ErroTransitorio('rede', 's3', { causa });
    expect(erro.name).toBe('ErroTransitorio');
    expect(erro.cause).toBe(causa);
    expect(new ErroPermanente('x', 's3').cause).toBeUndefined();
    expect(new ErroLimiteExcedido('429', 's3', { repetirAposMs: 1_500 }).repetirAposMs).toBe(1_500);
    expect(new ErroLimiteExcedido('429', 's3').repetirAposMs).toBeUndefined();
  });
});
