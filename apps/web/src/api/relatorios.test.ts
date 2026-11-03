import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { chaves } from './chaves';
import { criarCliente } from './cliente';
import { consultasRelatorios, mutacoesRelatorios } from './relatorios';

describe('relatórios (HU29)', () => {
  it('lista com nova consulta só enquanto houver pendente e pede o relatório', async () => {
    const rotas: string[] = [];
    const api = criarCliente({
      baseUrl: 'http://api.local',
      lerCookies: () => '',
      fetch: async (requisicao) => {
        const corpo = requisicao.method === 'POST' ? ` ${await requisicao.text()}` : '';
        rotas.push(`${requisicao.method} ${new URL(requisicao.url).pathname}${corpo}`);
        return Response.json(requisicao.method === 'POST' ? { id: 'r1' } : { itens: [] }, {
          status: requisicao.method === 'POST' ? 202 : 200,
        });
      },
    });
    const cache = new QueryClient();
    const lista = consultasRelatorios(api).lista();
    await lista.queryFn?.({ signal: new AbortController().signal } as never);
    const intervalo = lista.refetchInterval as (c: unknown) => number | false;
    expect(intervalo({ state: { data: { itens: [{ situacao: 'pendente' }] } } })).toBe(4_000);
    expect(intervalo({ state: { data: { itens: [{ situacao: 'concluido' }] } } })).toBe(false);
    expect(intervalo({ state: { data: undefined } })).toBe(false);
    cache.setQueryData(chaves.relatorios.lista(), { itens: [] });
    const m = mutacoesRelatorios(api, cache).solicitar;
    await m.mutationFn({
      tipo: 'agenda',
      formato: 'pdf',
      filtros: { de: '2026-11-01', ate: '2026-11-30' },
    });
    await m.onSuccess();
    expect(cache.getQueryState(chaves.relatorios.lista())?.isInvalidated).toBe(true);
    expect(rotas).toEqual([
      'GET /v1/relatorios',
      'POST /v1/relatorios {"tipo":"agenda","formato":"pdf","filtros":{"de":"2026-11-01","ate":"2026-11-30"}}',
    ]);
  });
});
