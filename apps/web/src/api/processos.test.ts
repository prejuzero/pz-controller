import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { chaves } from './chaves';
import { criarCliente } from './cliente';
import { consultasProcessos, mutacoesProcessos } from './processos';

function montar() {
  const requisicoes: { rota: string; corpo: string }[] = [];
  const api = criarCliente({
    baseUrl: 'http://localhost',
    lerCookies: () => '',
    fetch: async (requisicao) => {
      const url = new URL(requisicao.url);
      requisicoes.push({
        rota: `${requisicao.method} ${url.pathname}${url.search}`,
        corpo: await requisicao.text(),
      });
      return requisicao.method === 'DELETE'
        ? new Response(null, { status: 204 })
        : new Response('{"itens":[],"proximoCursor":"c2"}', {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
    },
  });
  const cache = new QueryClient();
  return { api, cache, requisicoes, mutacoes: mutacoesProcessos(api, cache) };
}

const ID = '0199a000-0000-7000-8000-000000000001';
const sinal = { signal: new AbortController().signal };

describe('processos (HU12)', () => {
  it('cada consulta e mutação chama a rota certa, sem campos indefinidos no corpo', async () => {
    const { api, requisicoes, mutacoes } = montar();
    const consultas = consultasProcessos(api);
    const lista = consultas.lista({ numero: '0000001' });
    const pagina = await lista.queryFn?.({ ...sinal, pageParam: 'c1' } as never);
    expect(lista.getNextPageParam(pagina as never, [], undefined, [])).toBe('c2');
    await consultas.detalhe(ID).queryFn?.(sinal as never);
    await consultas.clientes().queryFn?.(sinal as never);
    await consultas.equipe().queryFn?.(sinal as never);
    await mutacoes.cadastrar.mutationFn({ numeroCnj: '00000016820268260100', orgao: undefined });
    await mutacoes.atualizar.mutationFn({ id: ID, sigiloso: true });
    await mutacoes.alterarCobertura.mutationFn({ id: ID, cobertura: 'manual', motivo: 'Físico' });
    await mutacoes.cadastrarCliente.mutationFn({ nome: 'Cliente Fictício' });
    await mutacoes.atualizarCliente.mutationFn({ id: ID, nome: 'Outro Nome' });
    await mutacoes.removerCliente.mutationFn(ID);
    await consultas.conferencias().queryFn?.(sinal as never);
    await mutacoes.registrarConferencia.mutationFn({ id: ID, resultado: 'sem-novidade' });
    expect(requisicoes).toEqual([
      { rota: 'GET /v1/processos?numero=0000001&cursor=c1', corpo: '' },
      { rota: `GET /v1/processos/${ID}`, corpo: '' },
      { rota: 'GET /v1/clientes?limite=100', corpo: '' },
      { rota: 'GET /v1/advogados', corpo: '' },
      { rota: 'POST /v1/processos', corpo: '{"numeroCnj":"00000016820268260100"}' },
      { rota: `PATCH /v1/processos/${ID}`, corpo: '{"sigiloso":true}' },
      {
        rota: `PUT /v1/processos/${ID}/cobertura`,
        corpo: '{"cobertura":"manual","motivo":"Físico"}',
      },
      { rota: 'POST /v1/clientes', corpo: '{"nome":"Cliente Fictício"}' },
      { rota: `PATCH /v1/clientes/${ID}`, corpo: '{"nome":"Outro Nome"}' },
      { rota: `DELETE /v1/clientes/${ID}`, corpo: '' },
      { rota: 'GET /v1/conferencias', corpo: '' },
      { rota: `POST /v1/processos/${ID}/conferencias`, corpo: '{"resultado":"sem-novidade"}' },
    ]);
  });

  it('as mutações invalidam o cache do recurso alterado', async () => {
    const { cache, mutacoes } = montar();
    cache.setQueryData(chaves.processos.detalhe(ID), {});
    cache.setQueryData(chaves.clientes.lista(), {});
    await mutacoes.alterarCobertura.onSuccess();
    expect(cache.getQueryState(chaves.processos.detalhe(ID))?.isInvalidated).toBe(true);
    expect(cache.getQueryState(chaves.clientes.lista())?.isInvalidated).toBe(false);
    await mutacoes.removerCliente.onSuccess();
    expect(cache.getQueryState(chaves.clientes.lista())?.isInvalidated).toBe(true);
  });

  it('importação por CSV (HU42): rotas, consulta até concluir e lista atualizada no fim', async () => {
    const { api, cache, requisicoes, mutacoes } = montar();
    await mutacoes.importar.mutationFn({ csv: 'numeroCnj', somentePrevia: true });
    const consulta = consultasProcessos(api).importacao(ID);
    await consulta.queryFn?.(sinal as never);
    expect(requisicoes).toEqual([
      {
        rota: 'POST /v1/processos/importacoes',
        corpo: '{"csv":"numeroCnj","somentePrevia":true}',
      },
      { rota: `GET /v1/processos/importacoes/${ID}`, corpo: '' },
    ]);
    const intervalo = consulta.refetchInterval as (q: unknown) => number | false;
    expect(intervalo({ state: { data: { situacao: 'pendente' } } })).toBe(2_000);
    expect(intervalo({ state: { data: undefined } })).toBe(2_000);
    expect(intervalo({ state: { data: { situacao: 'concluida' } } })).toBe(false);
    cache.setQueryData(chaves.processos.lista({}), {});
    await mutacoes.importacaoConcluida();
    expect(cache.getQueryState(chaves.processos.lista({}))?.isInvalidated).toBe(true);
  });
});
