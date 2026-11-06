import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { criarCliente } from './cliente';
import { consultasEquipe, mutacoesEquipe } from './equipe';

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

describe('equipe no portal (HU41)', () => {
  it('consulta a equipe e chama as rotas das mutações', async () => {
    const { api, cache, requisicoes } = montar({ membros: [], convites: [] });
    await cache.query(consultasEquipe(api).equipe());
    const m = mutacoesEquipe(api, cache);
    await m.convidar.mutationFn({ email: 'a@exemplo.invalid', nome: 'A', perfil: 'colaborador' });
    await m.descreverConvite.mutationFn('t'.repeat(30));
    await m.convidar.onSuccess();
    const vazio = montar({}, 204);
    const m2 = mutacoesEquipe(vazio.api, vazio.cache);
    await m2.cancelarConvite.mutationFn(ID);
    await m2.alterarPerfis.mutationFn({ id: ID, perfis: ['advogado'] });
    await m2.desativar.mutationFn(ID);
    await m2.aceitarConvite.mutationFn({ token: 't'.repeat(30), senha: 'senha longa' });
    expect([...rotas(requisicoes), ...rotas(vazio.requisicoes)]).toEqual([
      'GET /v1/equipe',
      'POST /v1/equipe/convites',
      'POST /v1/equipe/convites/descrever',
      `DELETE /v1/equipe/convites/${ID}`,
      `PUT /v1/equipe/membros/${ID}/perfis`,
      `POST /v1/equipe/membros/${ID}/desativar`,
      'POST /v1/equipe/convites/aceitar',
    ]);
  });
});
