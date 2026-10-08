import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { consultasAdmin, mutacoesAdmin } from './admin';
import { chaves } from './chaves';
import { criarCliente } from './cliente';

const TENANT = '0199a000-0000-7000-8000-000000000001';

describe('área do administrador no portal (HU39)', () => {
  it('rotas, cursor e invalidação do cache', async () => {
    const requisicoes: Request[] = [];
    const api = criarCliente({
      baseUrl: 'http://localhost',
      lerCookies: () => '',
      fetch: (requisicao) => {
        requisicoes.push(requisicao);
        return Promise.resolve(
          new Response(JSON.stringify({ itens: [], proximoCursor: 'c2' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      },
    });
    const cache = new QueryClient();
    const consultas = consultasAdmin(api);
    await cache.infiniteQuery(consultas.tenants());
    await cache.infiniteQuery(consultas.rejeicoes());
    await cache.query(consultas.integracoes());
    await cache.query(consultas.filas());
    expect(
      consultas.tenants().getNextPageParam({ itens: [], proximoCursor: 'c2' }, [], undefined, []),
    ).toBe('c2');
    expect(
      consultas.rejeicoes().getNextPageParam({ itens: [], proximoCursor: null }, [], undefined, []),
    ).toBeUndefined();
    // Segunda página com o cursor devolvido pela primeira.
    await cache.infiniteQuery({ ...consultas.tenants(), pages: 2, staleTime: 0 });

    const mutacoes = mutacoesAdmin(api, cache);
    await mutacoes.alterarAssinatura.mutationFn({
      tenantId: TENANT,
      plano: null,
      situacaoAssinatura: 'ativa',
    });
    await mutacoes.suspender.mutationFn({ tenantId: TENANT, motivo: 'Chamado 1: teste fictício' });
    await mutacoes.reativar.mutationFn(TENANT);
    await mutacoes.impersonar.mutationFn({ tenantId: TENANT, motivo: 'Chamado 1: teste fictício' });
    expect(
      requisicoes.map((r) => `${r.method} ${new URL(r.url).pathname}${new URL(r.url).search}`),
    ).toEqual([
      'GET /v1/admin/tenants',
      'GET /v1/admin/rejeicoes-email',
      'GET /v1/admin/integracoes',
      'GET /v1/admin/filas',
      'GET /v1/admin/tenants',
      'GET /v1/admin/tenants?cursor=c2',
      `PATCH /v1/admin/tenants/${TENANT}/assinatura`,
      `POST /v1/admin/tenants/${TENANT}/suspensao`,
      `DELETE /v1/admin/tenants/${TENANT}/suspensao`,
      'POST /v1/admin/impersonacao',
    ]);
    expect(await requisicoes[6]?.json()).toEqual({ plano: null, situacaoAssinatura: 'ativa' });

    await mutacoes.reativar.onSuccess();
    expect(cache.getQueryState(chaves.admin.tenants())?.isInvalidated).toBe(true);
    await mutacoes.suspender.onSuccess();
    await mutacoes.alterarAssinatura.onSuccess();
    await mutacoes.impersonar.onSuccess();
    expect(cache.getQueryState(chaves.admin.filas())?.isInvalidated).toBe(true);
  });
});
