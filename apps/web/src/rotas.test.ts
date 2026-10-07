import { describe, expect, it } from 'vitest';

import {
  destinoAposEntrar,
  ehRotaPublica,
  retornoSeguro,
  tokenDoFragmento,
  urlEntrar,
} from './rotas';

describe('rotas', () => {
  it('só as telas de acesso são públicas', () => {
    expect(ehRotaPublica('/entrar')).toBe(true);
    expect(ehRotaPublica('/recuperar-senha')).toBe(true);
    expect(ehRotaPublica('/redefinir-senha')).toBe(true);
    expect(ehRotaPublica('/cadastro')).toBe(true);
    expect(ehRotaPublica('/verificar-email')).toBe(true);
    expect(ehRotaPublica('/configuracoes/seguranca')).toBe(false);
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

  it('leva ao 2FA enquanto a sessão estiver incompleta, preservando o retorno', () => {
    expect(destinoAposEntrar('verificar-2fa', null)).toBe('/entrar/2fa');
    expect(destinoAposEntrar('configurar-2fa', '/prazos')).toBe('/entrar/2fa?retorno=%2Fprazos');
    expect(destinoAposEntrar(null, '/prazos')).toBe('/prazos');
    expect(destinoAposEntrar(null, '//mal.com')).toBe('/');
  });

  it('lê o token do fragmento do link', () => {
    expect(tokenDoFragmento('#token=abc%2Bdef')).toBe('abc+def');
    expect(tokenDoFragmento('#token=')).toBeUndefined();
    expect(tokenDoFragmento('')).toBeUndefined();
  });
});
