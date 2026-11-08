import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { AVISO_DAS_FERRAMENTAS } from '@pz/contracts';
import { describe, expect, it } from 'vitest';

import { esquemaMcp } from './ambiente.js';
import { clienteDaApi } from './cliente-api.js';
import { CAMINHO_MCP, criarAppMcp } from './http.js';

// Token e dados FICTÍCIOS; a API é simulada em memória (o servidor MCP só fala com ela).
const TOKEN = 'token-ficticio';
const chamadas: string[] = [];

function apiFalsa(requisicao: Request): Promise<Response> {
  const { pathname } = new URL(requisicao.url);
  chamadas.push(`${requisicao.method} ${pathname}`);
  const json = (status: number, corpo: unknown) =>
    Promise.resolve(
      new Response(JSON.stringify(corpo), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  const autorizado = requisicao.headers.get('authorization') === `Bearer ${TOKEN}`;
  if (pathname === '/v1/auth/eu') return autorizado ? json(200, {}) : json(401, {});
  if (pathname === '/v1/ia/ferramentas') {
    return json(200, {
      itens: [
        {
          nome: 'buscar_prazos',
          descricao: 'Busca prazos.',
          entrada: { type: 'object', properties: { texto: { type: 'string' } } },
        },
      ],
      aviso: AVISO_DAS_FERRAMENTAS,
    });
  }
  if (pathname === '/v1/ia/ferramentas/buscar_prazos') {
    return json(200, { resultado: { itens: [{ id: 'p1' }] }, aviso: AVISO_DAS_FERRAMENTAS });
  }
  if (pathname === '/v1/ia/ferramentas/buscar_cota') return json(429, { title: 'Cota excedida' });
  if (pathname === '/v1/ia/ferramentas/buscar_publicacoes') {
    return json(403, { title: 'Proibido', detail: 'Sem permissão para buscar_publicacoes.' });
  }
  return json(500, {});
}

const app = criarAppMcp({ apiUrl: 'http://api.invalid', versao: 'teste', fetch: apiFalsa });
const BASE = 'http://mcp.invalid';

async function conectar(token = TOKEN) {
  const cliente = new Client({ name: 'assistente-ficticio', version: '1.0.0' });
  const transporte = new StreamableHTTPClientTransport(new URL(`${BASE}${CAMINHO_MCP}`), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
    fetch: (url, init) => app(new Request(url, init)),
  });
  await cliente.connect(transporte);
  return cliente;
}

describe('servidor MCP (HU60)', () => {
  it('lista as ferramentas da API, só leitura, com o aviso sobre datas', async () => {
    const cliente = await conectar();
    const { tools } = await cliente.listTools();
    expect(tools).toEqual([
      expect.objectContaining({
        name: 'buscar_prazos',
        description: `Busca prazos. ${AVISO_DAS_FERRAMENTAS}`,
        inputSchema: expect.objectContaining({ type: 'object' }) as unknown,
        annotations: { readOnlyHint: true, openWorldHint: false },
      }),
    ]);
    await cliente.close();
  });

  it('executa pela API e devolve o resultado com o aviso; erro da API volta como erro da ferramenta', async () => {
    const cliente = await conectar();
    expect(
      await cliente.callTool({ name: 'buscar_prazos', arguments: { texto: 'x' } }),
    ).toMatchObject({
      content: [
        { type: 'text', text: '{"itens":[{"id":"p1"}]}' },
        { type: 'text', text: AVISO_DAS_FERRAMENTAS },
      ],
    });
    expect(await cliente.callTool({ name: 'buscar_publicacoes', arguments: {} })).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: 'Sem permissão para buscar_publicacoes.' }],
    });
    expect(await cliente.callTool({ name: 'buscar_cota' })).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: 'Cota excedida' }],
    });
    expect(await cliente.callTool({ name: 'buscar_falha' })).toMatchObject({
      content: [{ type: 'text', text: 'A API respondeu 500.' }],
    });
    await cliente.close();
    expect(chamadas).toContain('POST /v1/ia/ferramentas/buscar_prazos');
  });

  it('sem token ou com token recusado pela API: 401 para o assistente autorizar', async () => {
    const semToken = await app(
      new Request(`${BASE}${CAMINHO_MCP}`, { method: 'POST', body: '{}' }),
    );
    expect(semToken.status).toBe(401);
    expect(semToken.headers.get('www-authenticate')).toBe('Bearer');
    await expect(conectar('outro-token')).rejects.toThrow();
  });

  it('saúde, rota inexistente, método sem estado e API fora do ar', async () => {
    expect((await app(new Request(`${BASE}/health/live`))).status).toBe(200);
    expect((await app(new Request(`${BASE}/outra`))).status).toBe(404);
    const get = await app(
      new Request(`${BASE}${CAMINHO_MCP}`, { headers: { authorization: `Bearer ${TOKEN}` } }),
    );
    expect(get.status).toBe(405);
    const foraDoAr = criarAppMcp({
      apiUrl: 'http://api.invalid',
      versao: 'teste',
      fetch: () => Promise.resolve(new Response('{}', { status: 503 })),
    });
    const r = await foraDoAr(
      new Request(`${BASE}${CAMINHO_MCP}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${TOKEN}` },
        body: '{}',
      }),
    );
    expect(r.status).toBe(502);
  });

  it('lista indisponível na API vira erro do protocolo', async () => {
    const semLista = criarAppMcp({
      apiUrl: 'http://api.invalid',
      versao: 'teste',
      fetch: (r) =>
        new URL(r.url).pathname === '/v1/auth/eu'
          ? Promise.resolve(new Response('{}', { status: 200 }))
          : Promise.resolve(new Response('"falha"', { status: 500 })),
    });
    const cliente = new Client({ name: 'assistente-ficticio', version: '1.0.0' });
    await cliente.connect(
      new StreamableHTTPClientTransport(new URL(`${BASE}${CAMINHO_MCP}`), {
        requestInit: { headers: { authorization: `Bearer ${TOKEN}` } },
        fetch: (url, init) => semLista(new Request(url, init)),
      }),
    );
    await expect(cliente.listTools()).rejects.toThrow('A API respondeu 500.');
    await cliente.close();
  });

  it('cliente da API usa o fetch global quando não há outro', () => {
    expect(clienteDaApi('http://api.invalid', TOKEN).GET).toBeTypeOf('function');
  });

  it('ambiente: porta e API com padrões locais', () => {
    expect(esquemaMcp.parse({})).toMatchObject({
      MCP_PORTA: 3004,
      MCP_API_URL: 'http://127.0.0.1:3000',
    });
  });
});
