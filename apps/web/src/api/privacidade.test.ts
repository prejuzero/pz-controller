import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { chaves } from './chaves';
import { criarCliente } from './cliente';
import { consultasPrivacidade, mutacoesPrivacidade } from './privacidade';

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
  requisicoes.map((r) => `${r.method} ${new URL(r.url).pathname}`);

describe('privacidade no portal (HU38)', () => {
  it('consultas: vigentes, pendentes, aceites, exportação e encerramento', async () => {
    const { api, cache, requisicoes } = montar({ itens: [] });
    const consultas = consultasPrivacidade(api);
    await cache.query(consultas.vigentes());
    await cache.query(consultas.pendentes());
    await cache.query(consultas.aceites());
    await cache.query(consultas.exportacao(ID));
    await cache.query(consultas.encerramento());
    expect(rotas(requisicoes)).toEqual([
      'GET /v1/termos/vigentes',
      'GET /v1/termos/pendentes',
      'GET /v1/termos/aceites',
      `GET /v1/privacidade/exportacoes/${ID}`,
      'GET /v1/privacidade/encerramento',
    ]);
  });

  it('exportação pendente é consultada de novo a cada 5 s; pronta, não', () => {
    const { api } = montar({});
    const intervalo = consultasPrivacidade(api).exportacao(ID).refetchInterval as (c: {
      state: { data?: { situacao: string } };
    }) => number | false;
    expect(intervalo({ state: { data: { situacao: 'pendente' } } })).toBe(5_000);
    expect(intervalo({ state: { data: { situacao: 'concluida' } } })).toBe(false);
  });

  it('aceitar envia um POST por documento e invalida a sessão', async () => {
    const { api, cache, requisicoes } = montar(null, 204);
    cache.setQueryData(chaves.sessao.atual(), { proximoPasso: 'aceitar-termos' });
    const mutacoes = mutacoesPrivacidade(api, cache);
    await mutacoes.aceitar.mutationFn([ID, `${ID.slice(0, -1)}2`]);
    await mutacoes.aceitar.onSuccess();
    expect(rotas(requisicoes)).toEqual([
      `POST /v1/termos/${ID}/aceitar`,
      `POST /v1/termos/${ID.slice(0, -1)}2/aceitar`,
    ]);
    expect(cache.getQueryState(chaves.sessao.atual())?.isInvalidated).toBe(true);
  });

  it('exportar, encerrar e cancelar', async () => {
    const { api, cache, requisicoes } = montar({ id: ID, nova: true });
    const mutacoes = mutacoesPrivacidade(api, cache);
    await mutacoes.exportar.mutationFn('titular');
    expect(await requisicoes[0]?.json()).toEqual({ escopo: 'titular' });
    await mutacoes.encerrar.mutationFn();
    await mutacoes.encerrar.onSuccess();
    expect(rotas(requisicoes)).toEqual([
      'POST /v1/privacidade/exportacoes',
      'POST /v1/privacidade/encerramento',
    ]);
    const cancelar = montar(null, 204);
    await mutacoesPrivacidade(cancelar.api, cancelar.cache).cancelarEncerramento.mutationFn();
    expect(rotas(cancelar.requisicoes)).toEqual(['POST /v1/privacidade/encerramento/cancelar']);
  });
});
