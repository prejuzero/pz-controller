import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { criarCliente } from './cliente';
import { consultasIntegracoes, mutacoesIntegracoes } from './integracoes';

const ID = '0199a000-0000-7000-8000-000000000001';

function montar(corpo: unknown, status = 200) {
  const requisicoes: Request[] = [];
  const api = criarCliente({
    baseUrl: 'http://localhost',
    lerCookies: () => '',
    fetch: (requisicao) => {
      requisicoes.push(requisicao);
      return Promise.resolve(
        new Response(status === 204 ? null : JSON.stringify(corpo), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
      );
    },
  });
  return { api, cache: new QueryClient(), requisicoes };
}
const rotas = (requisicoes: Request[]) =>
  requisicoes.map((r) => `${r.method} ${new URL(r.url).pathname}${new URL(r.url).search}`);

describe('integrações no portal (HU49)', () => {
  it('consultas: escopos, clientes, eventos, webhooks e entregas', async () => {
    const { api, cache, requisicoes } = montar({ itens: [] });
    const c = consultasIntegracoes(api);
    await cache.query(c.escopos());
    await cache.query(c.clientes());
    await cache.query(c.eventos());
    await cache.query(c.webhooks());
    await cache.query(c.entregas());
    expect(rotas(requisicoes)).toEqual([
      'GET /v1/integracoes/escopos',
      'GET /v1/integracoes/clientes',
      'GET /v1/integracoes/webhooks/eventos',
      'GET /v1/integracoes/webhooks',
      'GET /v1/integracoes/webhooks/entregas?limite=50',
    ]);
  });

  it('entregas pendentes são consultadas de novo a cada 5 s; sem pendente, não', () => {
    const { api } = montar({});
    const intervalo = consultasIntegracoes(api).entregas().refetchInterval as (c: {
      state: { data?: { itens: { situacao: string }[] } };
    }) => number | false;
    expect(intervalo({ state: { data: { itens: [{ situacao: 'pendente' }] } } })).toBe(5_000);
    expect(intervalo({ state: { data: { itens: [{ situacao: 'entregue' }] } } })).toBe(false);
    expect(intervalo({ state: {} })).toBe(false);
  });

  it('mutações chamam as rotas e invalidam o cache', async () => {
    const { api, cache, requisicoes } = montar({}, 204);
    const m = mutacoesIntegracoes(api, cache);
    await m.revogarCliente.mutationFn(ID);
    await m.desativarWebhook.mutationFn(ID);
    await m.reenviarEntrega.mutationFn(ID);
    for (const mutacao of [m.revogarCliente, m.desativarWebhook, m.reenviarEntrega]) {
      await mutacao.onSuccess();
    }
    const criacao = montar({ id: ID }, 201);
    const m2 = mutacoesIntegracoes(criacao.api, criacao.cache);
    await m2.registrarCliente.mutationFn({ nome: 'ERP', escopos: ['prazos:ler'] });
    await m2.registrarWebhook.mutationFn({
      url: 'https://erp.exemplo.invalid',
      descricao: 'ERP',
      eventos: ['prazo.vencido'],
    });
    await m2.testarWebhook.mutationFn(ID);
    for (const mutacao of [m2.registrarCliente, m2.registrarWebhook, m2.testarWebhook]) {
      await mutacao.onSuccess();
    }
    expect([...rotas(requisicoes), ...rotas(criacao.requisicoes)]).toEqual([
      `DELETE /v1/integracoes/clientes/${ID}`,
      `DELETE /v1/integracoes/webhooks/${ID}`,
      `POST /v1/integracoes/webhooks/entregas/${ID}/reenviar`,
      'POST /v1/integracoes/clientes',
      'POST /v1/integracoes/webhooks',
      `POST /v1/integracoes/webhooks/${ID}/testar`,
    ]);
  });

  it('app público e consentimento: descrever, autorizar e registrar', async () => {
    const { api, cache, requisicoes } = montar({ redirecionarPara: 'http://localhost:1/cb' });
    const pedido = {
      response_type: 'code',
      client_id: ID,
      redirect_uri: 'http://localhost:1/cb',
      code_challenge: 'x'.repeat(43),
      code_challenge_method: 'S256',
    };
    await cache.query(consultasIntegracoes(api).autorizacao(pedido));
    const m = mutacoesIntegracoes(api, cache);
    await m.autorizar.mutationFn(pedido);
    await m.registrarApp.mutationFn({
      nome: 'App',
      escopos: ['prazos:ler'],
      redirectUris: ['http://localhost:1/cb'],
    });
    await m.registrarApp.onSuccess();
    expect(rotas(requisicoes).map((r) => r.split('?')[0])).toEqual([
      'GET /v1/oauth/autorizacao',
      'POST /v1/oauth/autorizacao',
      'POST /v1/integracoes/apps',
    ]);
  });
});
