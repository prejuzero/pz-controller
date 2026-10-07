import { describe, expect, it } from 'vitest';

import { mascararCelular, mascararCpf } from './mascaras';

describe('máscaras (HU11)', () => {
  it.each([
    ['', ''],
    ['529', '529'],
    ['5299', '529.9'],
    ['5299822', '529.982.2'],
    ['529982247', '529.982.247'],
    ['5299822472', '529.982.247-2'],
    ['52998224725', '529.982.247-25'],
    ['529.982.247-25999', '529.982.247-25'],
  ])('CPF %s → %s', (texto, esperado) => {
    expect(mascararCpf(texto)).toBe(esperado);
  });

  it.each([
    ['', ''],
    ['1', '(1'],
    ['11', '(11'],
    ['119', '(11) 9'],
    ['1198765', '(11) 98765'],
    ['11987654321', '(11) 98765-4321'],
    ['(11) 98765-43219', '(11) 98765-4321'],
  ])('celular %s → %s', (texto, esperado) => {
    expect(mascararCelular(texto)).toBe(esperado);
  });
});
