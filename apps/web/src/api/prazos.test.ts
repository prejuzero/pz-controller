import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { chaves } from './chaves';
import { criarCliente } from './cliente';
import { consultasPrazos, mutacoesPrazos } from './prazos';

const ID = '0199a000-0000-7000-8000-000000000001';
const sinal = { signal: new AbortController().signal };

describe('prazos (HU24)', () => {
  it('consultas e ações chamam as rotas certas; a prévia não invalida o cache', async () => {
    const rotas: string[] = [];
    const api = criarCliente({
      baseUrl: 'http://localhost',
      lerCookies: () => '',
      fetch: async (requisicao) => {
        const url = new URL(requisicao.url);
        const corpo = requisicao.method === 'POST' ? await requisicao.text() : '';
        rotas.push(`${requisicao.method} ${url.pathname}${url.search} ${corpo}`.trim());
        return new Response('{"itens":[],"proximoCursor":"c2"}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    const cache = new QueryClient();
    const consultas = consultasPrazos(api);
    const lista = consultas.lista('pendente');
    const pagina = await lista.queryFn?.({ ...sinal, pageParam: undefined } as never);
    expect(lista.getNextPageParam(pagina as never, [], undefined, [])).toBe('c2');
    await lista.queryFn?.({ ...sinal, pageParam: 'c2' } as never);
    await consultas.detalhe(ID).queryFn?.(sinal as never);

    const m = mutacoesPrazos(api, cache);
    cache.setQueryData(chaves.prazos.detalhe(ID), {});
    await m.simular.mutationFn({ id: ID, versao: 2, motivo: 'motivo do ajuste', dias: 10 });
    expect(cache.getQueryState(chaves.prazos.detalhe(ID))?.isInvalidated).toBe(false);
    await m.confirmar.mutationFn({ id: ID, versao: 1 });
    await m.cumprir.mutationFn({ id: ID, versao: 3 });
    await m.ajustar.mutationFn({ id: ID, versao: 2, motivo: 'motivo do ajuste', dias: 10 });
    await m.cancelar.mutationFn({ id: ID, versao: 4, motivo: 'intimação duplicada' });
    await m.confirmar.onSuccess();
    expect(cache.getQueryState(chaves.prazos.detalhe(ID))?.isInvalidated).toBe(true);
    expect(rotas).toEqual([
      'GET /v1/prazos?status=pendente',
      'GET /v1/prazos?status=pendente&cursor=c2',
      `GET /v1/prazos/${ID}`,
      `POST /v1/prazos/${ID}/simular-ajuste {"versao":2,"motivo":"motivo do ajuste","dias":10}`,
      `POST /v1/prazos/${ID}/confirmar {"versao":1}`,
      `POST /v1/prazos/${ID}/cumprir {"versao":3}`,
      `POST /v1/prazos/${ID}/ajustar {"versao":2,"motivo":"motivo do ajuste","dias":10}`,
      `POST /v1/prazos/${ID}/cancelar {"versao":4,"motivo":"intimação duplicada"}`,
    ]);
  });
});
