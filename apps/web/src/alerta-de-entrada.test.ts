import { afterEach, describe, expect, it, vi } from 'vitest';

import { consumirEntrada, marcarEntrada } from './alerta-de-entrada';

describe('marca da entrada (HU34)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('vale uma vez depois do login', () => {
    const dados = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => dados.get(k) ?? null,
      setItem: (k: string, v: string) => dados.set(k, v),
      removeItem: (k: string) => dados.delete(k),
    });
    expect(consumirEntrada()).toBe(false);
    marcarEntrada();
    expect(consumirEntrada()).toBe(true);
    expect(consumirEntrada()).toBe(false);
  });

  it('sem armazenamento não quebra', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
    });
    expect(() => {
      marcarEntrada();
    }).not.toThrow();
    expect(consumirEntrada()).toBe(false);
  });
});
