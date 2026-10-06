import { CABECALHO_CSRF, COOKIE_CSRF } from '@pz/contracts';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { criarCliente, lerCookie } from './cliente';
import { ErroApi } from './erros';
import { consultasSessao, mutacoesSessao } from './sessao';

const sessao = {
  usuarioId: '0199a000-0000-7000-8000-000000000001',
  tenantId: '0199a000-0000-7000-8000-000000000002',
  nivel: 'completo',
  proximoPasso: null,
  permissoes: ['prazos:ler'],
};

const json = (corpo: unknown, status = 200, tipo = 'application/json') =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': tipo } });

function montar(resposta: Response) {
  const requisicoes: Request[] = [];
  const api = criarCliente({
    baseUrl: 'http://localhost',
    lerCookies: () => `outro=1; ${COOKIE_CSRF}=token%2Fcsrf`,
    fetch: (requisicao) => {
      requisicoes.push(requisicao);
      return Promise.resolve(resposta);
    },
  });
  return { api, requisicoes };
}

describe('cliente da API', () => {
  it('lê cookies pelo nome', () => {
    expect(lerCookie('a=1; b = x%3Dy', 'b')).toBe('x=y');
    expect(lerCookie('a=1', 'b')).toBeUndefined();
  });

  it('GET não envia CSRF e devolve os dados', async () => {
    const { api, requisicoes } = montar(json(sessao));
    await expect(new QueryClient().query(consultasSessao(api).atual())).resolves.toEqual(sessao);
    expect(requisicoes[0]?.url).toBe('http://localhost/v1/auth/eu');
    expect(requisicoes[0]?.headers.has(CABECALHO_CSRF)).toBe(false);
  });

  it('POST repete o token CSRF do cookie e limpa o cache ao sair', async () => {
    const { api, requisicoes } = montar(new Response(null, { status: 204 }));
    const cache = new QueryClient();
    cache.setQueryData(['sessao', 'atual'], sessao);
    const sair = mutacoesSessao(api, cache).sair;
    await sair.mutationFn();
    sair.onSuccess();
    expect(requisicoes[0]?.headers.get(CABECALHO_CSRF)).toBe('token/csrf');
    expect(cache.getQueryData(['sessao', 'atual'])).toBeUndefined();
  });

  it('POST sem cookie CSRF segue sem o cabeçalho', async () => {
    const requisicoes: Request[] = [];
    const api = criarCliente({
      baseUrl: 'http://localhost',
      lerCookies: () => '',
      fetch: (r) => (requisicoes.push(r), Promise.resolve(new Response(null, { status: 204 }))),
    });
    await mutacoesSessao(api, new QueryClient()).sair.mutationFn();
    expect(requisicoes[0]?.headers.has(CABECALHO_CSRF)).toBe(false);
  });

  it('erro problem+json vira ErroApi', async () => {
    const problema = {
      type: 'about:blank',
      title: 'Não autenticado',
      status: 401,
      codigo: 'auth.sem-sessao',
    };
    const { api } = montar(json(problema, 401, 'application/problem+json'));
    const erro: unknown = await new QueryClient({ defaultOptions: { queries: { retry: false } } })
      .query(consultasSessao(api).atual())
      .catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroApi);
    expect((erro as ErroApi).problema.codigo).toBe('auth.sem-sessao');
  });

  it('no navegador lê document.cookie e usa a mesma origem', () => {
    vi.stubGlobal('document', { cookie: '' });
    expect(() => criarCliente()).not.toThrow();
    vi.unstubAllGlobals();
  });
});
