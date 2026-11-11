import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { chaves } from './chaves';
import { criarCliente } from './cliente';
import {
  consultasCuradoriaClassificacao,
  mutacoesCuradoriaClassificacao,
} from './curadoria-classificacao';

describe('curadoria da classificação (PZ-336)', () => {
  it('lista a revisão e os pendentes, decide, exporta e atualiza as listas', async () => {
    const rotas: string[] = [];
    const corpos: unknown[] = [];
    const api = criarCliente({
      baseUrl: 'http://api.local',
      lerCookies: () => '',
      fetch: async (requisicao) => {
        const url = new URL(requisicao.url);
        rotas.push(`${requisicao.method} ${url.pathname}${url.search}`);
        if (requisicao.method === 'POST') corpos.push(await requisicao.json());
        return Response.json(url.pathname.endsWith('exportacao') ? { casos: [] } : { itens: [] });
      },
    });
    const cache = new QueryClient();
    const consultas = consultasCuradoriaClassificacao(api);
    const sinal = { signal: new AbortController().signal } as never;
    await consultas.revisaoManual().queryFn?.(sinal);
    await consultas.candidatosPendentes().queryFn?.(sinal);
    const m = mutacoesCuradoriaClassificacao(api, cache);
    const id = '0199a000-0000-7000-8000-000000000009';
    await m.decidir.mutationFn({ id, pedido: { decisao: 'descartar', motivo: 'Caso fictício.' } });
    expect(await m.exportar.mutationFn()).toEqual({ casos: [] });
    cache.setQueryData(consultas.candidatosPendentes().queryKey, {
      itens: [],
      proximoCursor: null,
    });
    await m.decidir.onSuccess();
    expect(
      cache.getQueryState([...chaves.curadoriaClassificacao.todas, 'candidatos'])?.isInvalidated,
    ).toBe(true);
    expect(rotas).toEqual([
      'GET /v1/admin/classificacoes/revisao-manual?limite=100',
      'GET /v1/admin/classificacoes/candidatos?status=pendente&limite=100',
      `POST /v1/admin/classificacoes/candidatos/${id}/decisao`,
      'GET /v1/admin/classificacoes/candidatos/exportacao',
    ]);
    expect(corpos).toEqual([{ decisao: 'descartar', motivo: 'Caso fictício.' }]);
  });
});
