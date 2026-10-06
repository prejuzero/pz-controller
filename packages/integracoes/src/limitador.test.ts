import { describe, expect, it } from 'vitest';

import { ErroLimiteExcedido } from './erros.js';
import { LimitadorEmMemoria } from './limitador.js';

describe('limitador de taxa (token bucket)', () => {
  it('libera um segundo de cota na hora e espaça o resto', async () => {
    const limitador = new LimitadorEmMemoria();
    const inicio = performance.now();
    for (let i = 0; i < 10; i++) await limitador.aguardarVez('a', 600);
    expect(performance.now() - inicio).toBeLessThan(50);
    await limitador.aguardarVez('a', 600);
    expect(performance.now() - inicio).toBeGreaterThanOrEqual(80);
  });

  it('cada chave tem o próprio balde', async () => {
    const limitador = new LimitadorEmMemoria();
    await limitador.aguardarVez('a', 60);
    const inicio = performance.now();
    await limitador.aguardarVez('b', 60);
    expect(performance.now() - inicio).toBeLessThan(50);
  });

  it('desiste com limite excedido além da espera máxima', async () => {
    const limitador = new LimitadorEmMemoria({ esperaMaximaMs: 10 });
    await limitador.aguardarVez('a', 60);
    await expect(limitador.aguardarVez('a', 60)).rejects.toBeInstanceOf(ErroLimiteExcedido);
  });

  it('a espera respeita o cancelamento', async () => {
    const limitador = new LimitadorEmMemoria();
    await limitador.aguardarVez('a', 60);
    const controle = new AbortController();
    const espera = limitador.aguardarVez('a', 60, controle.signal);
    controle.abort(new Error('cancelado'));
    await expect(espera).rejects.toThrow('cancelado');
    await expect(limitador.aguardarVez('a', 60, controle.signal)).rejects.toThrow('cancelado');
  });

  it('recusa limite inválido', async () => {
    await expect(new LimitadorEmMemoria().aguardarVez('a', 0)).rejects.toThrow('inválido');
    await expect(new LimitadorEmMemoria().aguardarVez('a', 1.5)).rejects.toThrow('inválido');
  });
});
