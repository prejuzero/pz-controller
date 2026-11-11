import { describe, expect, it } from 'vitest';

import { criarCliente, precisaAtualizar } from './cliente';

describe('cliente da API no app (HU63)', () => {
  it('toda chamada leva X-Cliente e, com sessão, o token de acesso', async () => {
    const pedidos: Request[] = [];
    const sessao: { token?: string } = {};
    const api = criarCliente({
      baseUrl: 'http://api.local',
      versao: '0.1.0',
      token: () => sessao.token,
      fetch: (r) => {
        pedidos.push(r);
        return Promise.resolve(Response.json({ status: 'ok' }));
      },
    });
    await api.GET('/v1/saude');
    sessao.token = 'token-ficticio';
    await api.GET('/v1/saude');
    expect(pedidos.map((r) => r.headers.get('x-cliente'))).toEqual([
      'mobile/0.1.0',
      'mobile/0.1.0',
    ]);
    expect(pedidos.map((r) => r.headers.get('authorization'))).toEqual([
      null,
      'Bearer token-ficticio',
    ]);
  });

  it('sem fetch próprio usa o global; sem sessão, nenhum Authorization', async () => {
    const original = globalThis.fetch;
    const pedidos: Request[] = [];
    globalThis.fetch = (r: RequestInfo | URL) => {
      pedidos.push(r as Request);
      return Promise.resolve(Response.json({}));
    };
    try {
      await criarCliente({ baseUrl: 'http://api.local', versao: '1.2.3' }).GET('/v1/saude');
    } finally {
      globalThis.fetch = original;
    }
    expect(pedidos[0]?.headers.get('x-cliente')).toBe('mobile/1.2.3');
    expect(pedidos[0]?.headers.get('authorization')).toBeNull();
  });

  it('426 é o pedido de atualização do app', () => {
    expect(precisaAtualizar(new Response(null, { status: 426 }))).toBe(true);
    expect(precisaAtualizar(new Response(null, { status: 200 }))).toBe(false);
  });
});
