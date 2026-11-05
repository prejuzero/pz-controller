import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { chaves } from './chaves';
import { criarCliente } from './cliente';
import { consultasNotificacoes, mutacaoEnvioPorEmail } from './notificacoes';

// Envios por e-mail no portal (PZ-361). Dados FICTÍCIOS.
function montar(corpo: unknown, status = 200) {
  const requisicoes: Request[] = [];
  const api = criarCliente({
    baseUrl: 'http://localhost',
    lerCookies: () => '',
    fetch: (requisicao) => {
      requisicoes.push(requisicao);
      return Promise.resolve(
        new Response(JSON.stringify(corpo), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
      );
    },
  });
  return { api, cache: new QueryClient(), requisicoes };
}

describe('envios por e-mail (PZ-361)', () => {
  it('lista os envios; pendente é consultado de novo, sem pendente não', async () => {
    const { api, cache, requisicoes } = montar({ itens: [] });
    const consulta = consultasNotificacoes(api).envios();
    await cache.query(consulta);
    expect(requisicoes.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
      'GET /v1/envios',
    ]);
    const intervalo = consulta.refetchInterval as (c: {
      state: { data?: { itens: { situacao: string }[] } };
    }) => number | false;
    expect(intervalo({ state: { data: { itens: [{ situacao: 'pendente' }] } } })).toBe(10_000);
    expect(intervalo({ state: { data: { itens: [{ situacao: 'enviado' }] } } })).toBe(false);
    expect(intervalo({ state: {} })).toBe(false);
  });

  it('enviar invalida a lista de envios', async () => {
    const { api, cache } = montar({ id: 'x', externos: [] }, 202);
    cache.setQueryData(chaves.notificacoes.envios(), { itens: [] });
    const mutacao = mutacaoEnvioPorEmail(api, cache);
    await mutacao.onSuccess();
    expect(cache.getQueryState(chaves.notificacoes.envios())?.isInvalidated).toBe(true);
  });
});
