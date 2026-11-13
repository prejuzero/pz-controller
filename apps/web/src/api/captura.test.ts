import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { consultasCaptura, mutacoesCaptura } from './captura';
import { criarCliente } from './cliente';

describe('captura (HU19)', () => {
  it('status consulta a rota e se atualiza sozinho', async () => {
    const rotas: string[] = [];
    const api = criarCliente({
      baseUrl: 'http://localhost',
      lerCookies: () => '',
      fetch: (requisicao) => {
        rotas.push(`${requisicao.method} ${new URL(requisicao.url).pathname}`);
        return Promise.resolve(
          new Response('{"fonte":{"id":"djen","situacao":"operacional","desde":null},"oabs":[]}', {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      },
    });
    const status = consultasCaptura(api).status();
    await status.queryFn?.({ signal: new AbortController().signal } as never);
    expect(rotas).toEqual(['GET /v1/captura/status']);
    expect(status.refetchInterval).toBe(60_000);
  });

  it('buscar agora: POST na OAB e o status é consultado de novo', async () => {
    const rotas: string[] = [];
    const api = criarCliente({
      baseUrl: 'http://localhost',
      lerCookies: () => '',
      fetch: (requisicao) => {
        rotas.push(`${requisicao.method} ${new URL(requisicao.url).pathname}`);
        return Promise.resolve(
          new Response('{"solicitadaEm":"2026-10-07T12:00:00.000Z"}', {
            status: 202,
            headers: { 'content-type': 'application/json' },
          }),
        );
      },
    });
    const cache = new QueryClient();
    const invalidadas: unknown[] = [];
    cache.invalidateQueries = (filtro) => {
      invalidadas.push(filtro?.queryKey);
      return Promise.resolve();
    };
    const { buscarAgora } = mutacoesCaptura(api, cache);
    const id = '01a10e00-0000-7000-8000-000000000001';
    expect(await buscarAgora.mutationFn(id)).toEqual({ solicitadaEm: '2026-10-07T12:00:00.000Z' });
    await buscarAgora.onSuccess();
    expect(rotas).toEqual([`POST /v1/captura/oabs/${id}/buscar-agora`]);
    expect(invalidadas).toEqual([consultasCaptura(api).status().queryKey]);
  });
});
