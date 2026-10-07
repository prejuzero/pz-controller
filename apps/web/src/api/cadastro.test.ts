import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { consultasCadastro, mutacoesCadastro } from './cadastro';
import { chaves } from './chaves';
import { criarCliente } from './cliente';

function montar() {
  const requisicoes: Request[] = [];
  const api = criarCliente({
    baseUrl: 'http://localhost',
    lerCookies: () => '',
    fetch: (requisicao) => {
      requisicoes.push(requisicao);
      return Promise.resolve(
        requisicao.method === 'DELETE' || requisicao.url.endsWith('/verificar')
          ? new Response(null, { status: 204 })
          : new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    },
  });
  const cache = new QueryClient();
  return { api, cache, requisicoes, mutacoes: mutacoesCadastro(api, cache) };
}

const rota = (r: Request | undefined) =>
  `${r?.method ?? ''} ${new URL(r?.url ?? 'http://x').pathname}`;
const ID = '0199a000-0000-7000-8000-000000000001';

describe('cadastro (HU11)', () => {
  it('cada consulta e mutação chama a rota certa; as do perfil invalidam o cache', async () => {
    const { api, cache, requisicoes, mutacoes } = montar();
    await consultasCadastro(api)
      .perfil()
      .queryFn?.({ signal: new AbortController().signal } as never);
    await mutacoes.cadastrar.mutationFn({
      nome: 'Pessoa Fictícia',
      cpf: '52998224725',
      email: 'p@exemplo.com',
      senha: 'uma frase longa',
      celular: '11987654321',
      oabPrincipal: { numero: '1', uf: 'SP' },
    });
    await mutacoes.verificarEmail.mutationFn('tok');
    await mutacoes.atualizarPerfil.mutationFn({ nome: 'Outro Nome' });
    await mutacoes.adicionarOab.mutationFn({ numero: '2', uf: 'RJ' });
    await mutacoes.removerOab.mutationFn(ID);
    expect(requisicoes.map(rota)).toEqual([
      'GET /v1/perfil',
      'POST /v1/cadastro',
      'POST /v1/email/verificar',
      'PATCH /v1/perfil',
      'POST /v1/oabs',
      `DELETE /v1/oabs/${ID}`,
    ]);
    cache.setQueryData(chaves.cadastro.perfil(), {});
    await mutacoes.removerOab.onSuccess();
    expect(cache.getQueryState(chaves.cadastro.perfil())?.isInvalidated).toBe(true);
  });
});
