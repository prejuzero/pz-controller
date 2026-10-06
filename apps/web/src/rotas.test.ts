import { describe, expect, it } from 'vitest';

import { ehRotaPublica, retornoSeguro, urlEntrar } from './rotas';

describe('rotas', () => {
  it('só /entrar é pública', () => {
    expect(ehRotaPublica('/entrar')).toBe(true);
    expect(ehRotaPublica('/entrar/2fa')).toBe(true);
    expect(ehRotaPublica('/entrarx')).toBe(false);
    expect(ehRotaPublica('/')).toBe(false);
  });

  it.each(['https://mal.com', '//mal.com', '/\\mal.com', '', null, undefined])(
    'recusa retorno externo ou vazio (%s)',
    (valor) => {
      expect(retornoSeguro(valor)).toBe('/');
    },
  );

  it('preserva o retorno e o motivo', () => {
    expect(urlEntrar('/prazos?pagina=2', 'sessao-expirada')).toBe(
      '/entrar?retorno=%2Fprazos%3Fpagina%3D2&motivo=sessao-expirada',
    );
    expect(urlEntrar('/')).toBe('/entrar');
    expect(urlEntrar('//mal.com')).toBe('/entrar');
  });
});
