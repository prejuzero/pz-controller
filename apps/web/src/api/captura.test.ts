import { describe, expect, it } from 'vitest';

import { consultasCaptura } from './captura';
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
});
