import { describe, expect, it } from 'vitest';

import { consultasBusca } from './busca';
import { criarCliente } from './cliente';

const sinal = { signal: new AbortController().signal };

describe('busca (HU28)', () => {
  it('envia os filtros no corpo, com o cursor da próxima página', async () => {
    const rotas: string[] = [];
    const api = criarCliente({
      baseUrl: 'http://localhost',
      lerCookies: () => '',
      fetch: async (requisicao) => {
        rotas.push(`${new URL(requisicao.url).pathname} ${await requisicao.text()}`);
        return new Response('{"itens":[],"proximoCursor":"c2","processoExato":null}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    const c = consultasBusca(api);
    const prazos = c.prazos({ tribunal: 'TJGO' });
    const pagina = await prazos.queryFn?.({ ...sinal, pageParam: undefined } as never);
    expect(prazos.getNextPageParam(pagina as never, [], undefined, [])).toBe('c2');
    await prazos.queryFn?.({ ...sinal, pageParam: 'c2' } as never);
    await c
      .publicacoes({ palavraChave: 'x' })
      .queryFn?.({ ...sinal, pageParam: undefined } as never);
    await c.publicacoes({}).queryFn?.({ ...sinal, pageParam: 'c3' } as never);
    await c.rapida('Fulano').queryFn?.(sinal as never);
    expect(c.rapida('x').enabled).toBe(false);
    expect(rotas).toEqual([
      '/v1/busca/prazos {"tribunal":"TJGO","limite":20}',
      '/v1/busca/prazos {"tribunal":"TJGO","limite":20,"cursor":"c2"}',
      '/v1/busca/publicacoes {"palavraChave":"x","limite":20}',
      '/v1/busca/publicacoes {"limite":20,"cursor":"c3"}',
      '/v1/busca/rapida {"texto":"Fulano"}',
    ]);
  });
});
