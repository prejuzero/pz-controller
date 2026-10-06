import { COOKIE_SESSAO } from '@pz/contracts';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { proxy } from './proxy';

const requisicao = (caminho: string, cookie?: string) =>
  new NextRequest(
    `http://localhost:3001${caminho}`,
    cookie === undefined ? {} : { headers: { cookie } },
  );

describe('proxy de sessão', () => {
  it('rota protegida sem sessão vai para /entrar preservando a URL', () => {
    const resposta = proxy(requisicao('/prazos?pagina=2'));
    expect(resposta.status).toBe(307);
    expect(resposta.headers.get('location')).toBe(
      'http://localhost:3001/entrar?retorno=%2Fprazos%3Fpagina%3D2',
    );
  });

  it('deixa passar com cookie de sessão ou em rota pública', () => {
    expect(proxy(requisicao('/prazos', `${COOKIE_SESSAO}=abc`)).headers.get('location')).toBeNull();
    expect(proxy(requisicao('/entrar')).headers.get('location')).toBeNull();
  });
});
