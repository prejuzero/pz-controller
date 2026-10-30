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
    const lista = consultas.lista({ status: 'pendente' });
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
    const novo = {
      processoId: ID,
      tipoAto: 'citacao',
      meio: 'djen' as const,
      dataDeReferencia: '2026-10-05',
      origem: 'manual' as const,
    };
    await m.simularNovo.mutationFn(novo);
    await m.cadastrar.mutationFn({ ...novo, vencimentoConfirmado: '2026-10-26' });
    await consultas.atos().queryFn?.(sinal as never);
    await consultas
      .compromissos('2026-11-01T00:00:00Z', '2026-11-30T00:00:00Z')
      .queryFn?.(sinal as never);
    await m.agendar.mutationFn({ titulo: 'Audiência', dataHora: '2026-11-10T17:00:00.000Z' });
    await m.cancelarCompromisso.mutationFn({ id: ID, motivo: 'audiência redesignada' });
    await m.analisar.mutationFn('Cite-se');
    await m.analisarPdf.mutationFn(new Blob(['%PDF-1.4'], { type: 'application/pdf' }));
    await m.linkDoDocumento.mutationFn(ID);
    await consultas
      .lista({ recorte: 'vence-hoje' })
      .queryFn?.({ ...sinal, pageParam: undefined } as never);
    await consultas.resumo().queryFn?.(sinal as never);
    await consultas.linhaDoTempo().queryFn?.(sinal as never);
    await consultas.proximos().queryFn?.(sinal as never);
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
      `POST /v1/prazos/simular {"processoId":"${ID}","tipoAto":"citacao","meio":"djen","dataDeReferencia":"2026-10-05","origem":"manual"}`,
      `POST /v1/prazos {"processoId":"${ID}","tipoAto":"citacao","meio":"djen","dataDeReferencia":"2026-10-05","origem":"manual","vencimentoConfirmado":"2026-10-26"}`,
      'GET /v1/tipos-de-ato',
      'GET /v1/compromissos?de=2026-11-01T00%3A00%3A00Z&ate=2026-11-30T00%3A00%3A00Z',
      'POST /v1/compromissos {"titulo":"Audiência","dataHora":"2026-11-10T17:00:00.000Z"}',
      `POST /v1/compromissos/${ID}/cancelar {"motivo":"audiência redesignada"}`,
      'POST /v1/assistente/analisar {"texto":"Cite-se"}',
      'POST /v1/assistente/pdf %PDF-1.4',
      `GET /v1/prazos/${ID}/documento`,
      'GET /v1/prazos?recorte=vence-hoje',
      'GET /v1/dashboard/resumo',
      'GET /v1/dashboard/linha-do-tempo?dias=30',
      'GET /v1/dashboard/proximos-prazos?limite=10',
    ]);
  });
});
