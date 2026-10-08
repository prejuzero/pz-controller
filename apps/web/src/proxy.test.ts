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

  it('encaminha /v1 para a API_URL lida em execução, com a query', () => {
    const anterior = process.env.API_URL;
    process.env.API_URL = 'http://api:3000';
    try {
      const resposta = proxy(requisicao('/v1/sessao?x=1'));
      expect(resposta.headers.get('x-middleware-rewrite')).toBe('http://api:3000/v1/sessao?x=1');
    } finally {
      if (anterior === undefined) delete process.env.API_URL;
      else process.env.API_URL = anterior;
    }
  });

  it('encaminha o painel de filas (/admin/filas e seus arquivos) para a API', () => {
    for (const caminho of ['/admin/filas', '/admin/filas/static/app.js']) {
      expect(proxy(requisicao(caminho)).headers.get('x-middleware-rewrite')).toBe(
        `http://localhost:3000${caminho}`,
      );
    }
    expect(proxy(requisicao('/admin/integracoes')).headers.get('x-middleware-rewrite')).toBeNull();
  });
});
