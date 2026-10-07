import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { consultasCalendario, corpoDoEvento, mutacoesCalendario, periodoDoAno } from './calendario';
import { chaves } from './chaves';
import { criarCliente } from './cliente';

function montar(corpo: unknown) {
  const requisicoes: Request[] = [];
  const api = criarCliente({
    baseUrl: 'http://localhost',
    lerCookies: () => '',
    fetch: (requisicao) => {
      requisicoes.push(requisicao);
      return Promise.resolve(
        new Response(JSON.stringify(corpo), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    },
  });
  const cache = new QueryClient();
  return { api, cache, requisicoes, mutacoes: mutacoesCalendario(api, cache) };
}

const rota = (requisicao: Request | undefined) => {
  const url = new URL(requisicao?.url ?? 'http://x');
  return `${requisicao?.method ?? ''} ${url.pathname}${url.search}`;
};
const corpo = async (requisicao: Request | undefined) => (await requisicao?.json()) as unknown;

const ID = '0199a000-0000-7000-8000-000000000001';
const pedido = {
  abrangencia: 'comarca',
  tribunal: 'TJSP',
  comarca: 'Campinas',
  tipo: 'feriado',
  inicio: '2026-12-08',
  fim: '2026-12-08',
  descricao: 'Feriado municipal fictício',
  atoNormativo: 'Lei municipal fictícia, art. 1º',
  urlAto: 'https://exemplo.gov.br/lei',
} as const;

describe('calendário (HU13)', () => {
  it('o período do ano vai de 1º/1 a 31/12', () => {
    expect(periodoDoAno(2026)).toEqual({ inicio: '2026-01-01', fim: '2026-12-31' });
  });

  it('campos de local ausentes não vão no corpo', () => {
    expect(corpoDoEvento({ ...pedido, uf: undefined })).toEqual(pedido);
    expect(Object.keys(corpoDoEvento({ ...pedido, uf: undefined }))).not.toContain('uf');
  });

  it('lista o calendário global e os feriados locais do ano', async () => {
    const { api, requisicoes } = montar({ itens: [] });
    const consultas = consultasCalendario(api);
    const sinal = new AbortController().signal;
    const global = consultas.global(2026);
    const locais = consultas.locais(2027);
    expect(global.queryKey).toEqual(chaves.calendario.global(2026));
    await global.queryFn?.({ signal: sinal } as never);
    await locais.queryFn?.({ signal: sinal } as never);
    expect(requisicoes.map(rota)).toEqual([
      'GET /v1/admin/calendario?inicio=2026-01-01&fim=2026-12-31',
      'GET /v1/calendario/locais?inicio=2027-01-01&fim=2027-12-31',
    ]);
  });

  it('cada mutação chama a rota certa e invalida o calendário', async () => {
    const { cache, requisicoes, mutacoes } = montar({});
    cache.setQueryData(chaves.calendario.global(2026), { itens: [] });
    cache.setQueryData(chaves.calendario.locais(2026), { itens: [] });

    await mutacoes.propor.mutationFn(pedido);
    await mutacoes.aprovar.mutationFn(ID);
    await mutacoes.revogar.mutationFn({ id: ID, motivo: 'ato revogado pela portaria nova' });
    await mutacoes.importar.mutationFn({ csv: 'a;b', somentePrevia: true });
    await mutacoes.cadastrarLocal.mutationFn(pedido);
    await mutacoes.revogarLocal.mutationFn(ID);
    expect(requisicoes.map(rota)).toEqual([
      'POST /v1/admin/calendario',
      `POST /v1/admin/calendario/${ID}/aprovar`,
      `POST /v1/admin/calendario/${ID}/revogar`,
      'POST /v1/admin/calendario/importacao',
      'POST /v1/calendario/locais',
      `POST /v1/calendario/locais/${ID}/revogar`,
    ]);
    expect(await corpo(requisicoes[2])).toEqual({ motivo: 'ato revogado pela portaria nova' });
    expect(await corpo(requisicoes[3])).toEqual({ csv: 'a;b', somentePrevia: true });

    await mutacoes.revogarLocal.onSuccess();
    expect(cache.getQueryState(chaves.calendario.global(2026))?.isInvalidated).toBe(true);
    expect(cache.getQueryState(chaves.calendario.locais(2026))?.isInvalidated).toBe(true);
  });
});
