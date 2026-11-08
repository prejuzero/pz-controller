import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { chaves } from './chaves';
import { criarCliente } from './cliente';
import { consultasPublicacoes, mutacoesPublicacoes } from './publicacoes';

const ID = '0199a000-0000-7000-8000-000000000001';
const sinal = { signal: new AbortController().signal };

describe('publicações (HU18)', () => {
  it('consultas e leitura chamam as rotas certas e invalidam o cache', async () => {
    const rotas: string[] = [];
    const api = criarCliente({
      baseUrl: 'http://localhost',
      lerCookies: () => '',
      fetch: (requisicao) => {
        const url = new URL(requisicao.url);
        rotas.push(`${requisicao.method} ${url.pathname}${url.search}`);
        return Promise.resolve(
          requisicao.method === 'POST'
            ? new Response(null, { status: 204 })
            : new Response('{"itens":[],"proximoCursor":"c2"}', {
                status: 200,
                headers: { 'content-type': 'application/json' },
              }),
        );
      },
    });
    const cache = new QueryClient();
    const consultas = consultasPublicacoes(api);
    const lista = consultas.lista({ novas: 'true' });
    const pagina = await lista.queryFn?.({ ...sinal, pageParam: undefined } as never);
    expect(lista.getNextPageParam(pagina as never, [], undefined, [])).toBe('c2');
    await lista.queryFn?.({ ...sinal, pageParam: 'c2' } as never);
    await consultas.detalhe(ID).queryFn?.(sinal as never);
    cache.setQueryData(chaves.publicacoes.detalhe(ID), {});
    const { marcarLida, conferir } = mutacoesPublicacoes(api, cache);
    await marcarLida.mutationFn(ID);
    await marcarLida.onSuccess();
    // Conferência da capturada pelo nome (HU42): atualiza publicações e processos.
    await consultas
      .lista({ conferir: 'true' })
      .queryFn?.({ ...sinal, pageParam: undefined } as never);
    await conferir.mutationFn({ id: ID, decisao: 'confirmar' });
    cache.setQueryData(chaves.processos.lista({}), {});
    await conferir.onSuccess();
    expect(cache.getQueryState(chaves.processos.lista({}))?.isInvalidated).toBe(true);
    expect(rotas).toEqual([
      'GET /v1/publicacoes?novas=true',
      'GET /v1/publicacoes?novas=true&cursor=c2',
      `GET /v1/publicacoes/${ID}`,
      `POST /v1/publicacoes/${ID}/lida`,
      'GET /v1/publicacoes?conferir=true',
      `POST /v1/publicacoes/${ID}/conferencia`,
    ]);
    expect(cache.getQueryState(chaves.publicacoes.detalhe(ID))?.isInvalidated).toBe(true);
  });
});
