import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { chaves } from './chaves';
import { criarCliente } from './cliente';
import {
  agruparVersoes,
  consultasTabelaPrazos,
  diferencas,
  mutacoesTabelaPrazos,
} from './tabela-prazos';

import type { VersaoDaTabela } from '@pz/contracts';

// Versões FICTÍCIAS: só exercitam a tela, sem regra jurídica real.
const versao = (parcial: Partial<VersaoDaTabela>): VersaoDaTabela => ({
  id: '0199a000-0000-7000-8000-000000000001',
  tipoAto: 'ficticio-a',
  ramo: 'civel',
  versao: 1,
  dias: 15,
  unidade: 'dias',
  fundamento: 'FICTÍCIO: Lei de Teste, art. 1º',
  fonteUrl: 'https://exemplo.invalid/ficticio',
  vigenciaInicio: '2030-01-01',
  vigenciaFim: null,
  status: 'aprovado',
  propostoPor: '0199a000-0000-7000-8000-00000000000a',
  propostoEm: '2026-10-07T12:00:00.000Z',
  aprovadoPor: '0199a000-0000-7000-8000-00000000000b',
  aprovadoEm: '2026-10-07T13:00:00.000Z',
  ...parcial,
});

describe('tabela de prazos no portal (HU15)', () => {
  it('agrupa por ato e ramo, da versão mais nova para a mais antiga', () => {
    const grupos = agruparVersoes([
      versao({ versao: 1 }),
      versao({ versao: 3, status: 'rascunho', aprovadoPor: null, aprovadoEm: null }),
      versao({ versao: 2 }),
      versao({ tipoAto: 'ficticio-a', ramo: 'penal' }),
    ]);
    expect(grupos.map((g) => [g.tipoAto, g.ramo, g.versoes.map((v) => v.versao)])).toEqual([
      ['ficticio-a', 'civel', [3, 2, 1]],
      ['ficticio-a', 'penal', [1]],
    ]);
    expect(grupos[0]?.ultimaAprovada?.versao).toBe(2);
    expect(grupos[0]?.rascunhos).toBe(1);
    expect(agruparVersoes([versao({ status: 'rascunho' })])[0]?.ultimaAprovada).toBeUndefined();
  });

  it('diff entre versões: só os campos que mudaram, com ausente como travessão', () => {
    expect(
      diferencas(versao({}), versao({ versao: 2, dias: 30, vigenciaFim: '2031-12-31' })),
    ).toEqual([
      { campo: 'dias', antes: '15', depois: '30' },
      { campo: 'vigenciaFim', antes: '—', depois: '2031-12-31' },
    ]);
    expect(diferencas(versao({}), versao({ versao: 2 }))).toEqual([]);
  });

  it('rotas, corpo sem campos ausentes e invalidação do cache', async () => {
    const requisicoes: Request[] = [];
    const api = criarCliente({
      baseUrl: 'http://localhost',
      lerCookies: () => '',
      fetch: (requisicao) => {
        requisicoes.push(requisicao);
        return Promise.resolve(
          new Response(JSON.stringify({ itens: [] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      },
    });
    const cache = new QueryClient();
    const consultas = consultasTabelaPrazos(api);
    expect(consultas.versoes().queryKey).toEqual(chaves.tabelaPrazos.versoes());
    await cache.query(consultas.tiposDeAto());
    await cache.query(consultas.versoes());
    const mutacoes = mutacoesTabelaPrazos(api, cache);
    await mutacoes.propor.mutationFn({
      tipoAto: 'ficticio-a',
      ramo: 'civel',
      dias: 15,
      unidade: 'dias',
      fundamento: 'FICTÍCIO',
      fonteUrl: 'https://exemplo.invalid/ficticio',
      vigenciaInicio: '2030-01-01',
      vigenciaFim: undefined,
    });
    await mutacoes.aprovar.mutationFn('0199a000-0000-7000-8000-000000000001');
    await mutacoes.cadastrarTipo.mutationFn({ codigo: 'ficticio-b', nome: 'B', descricao: '' });
    expect(requisicoes.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
      'GET /v1/admin/tabela-prazos/tipos-de-ato',
      'GET /v1/admin/tabela-prazos',
      'POST /v1/admin/tabela-prazos',
      'POST /v1/admin/tabela-prazos/0199a000-0000-7000-8000-000000000001/aprovar',
      'POST /v1/admin/tabela-prazos/tipos-de-ato',
    ]);
    expect(await requisicoes[2]?.json()).not.toHaveProperty('vigenciaFim');

    await mutacoes.aprovar.onSuccess();
    expect(cache.getQueryState(chaves.tabelaPrazos.versoes())?.isInvalidated).toBe(true);
  });
});
