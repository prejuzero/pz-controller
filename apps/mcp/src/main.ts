import { createServer } from 'node:http';
import { Readable } from 'node:stream';

import { carregarAmbiente } from '@pz/config/env';
import { criarLogger } from '@pz/observability';

import { esquemaMcp } from './ambiente.js';
import { criarAppMcp } from './http.js';

const logger = criarLogger('mcp');
const ambiente = carregarAmbiente(esquemaMcp, process.env);
const app = criarAppMcp({
  apiUrl: ambiente.MCP_API_URL,
  urlPublica: ambiente.MCP_URL_PUBLICA,
  versao: ambiente.VERSAO,
});

/** Adaptador mínimo node:http ↔ Request/Response (o transporte do SDK é o padrão da web). */
const servidor = createServer((pedido, resposta) => {
  const url = `http://${pedido.headers.host ?? 'localhost'}${pedido.url ?? '/'}`;
  const comCorpo = pedido.method !== 'GET' && pedido.method !== 'HEAD';
  const requisicao = new Request(url, {
    method: pedido.method ?? 'GET',
    headers: Object.entries(pedido.headers).flatMap<[string, string]>(([nome, valor]) =>
      valor === undefined ? [] : [[nome, Array.isArray(valor) ? valor.join(', ') : valor]],
    ),
    ...(comCorpo ? { body: Readable.toWeb(pedido) as ReadableStream, duplex: 'half' } : {}),
  });
  app(requisicao)
    .then(async (r) => {
      resposta.writeHead(r.status, Object.fromEntries(r.headers));
      resposta.end(Buffer.from(await r.arrayBuffer()));
    })
    .catch((erro: unknown) => {
      logger.error({ err: erro }, 'falha ao atender o pedido MCP');
      resposta.writeHead(500, { 'content-type': 'application/json' });
      resposta.end('{"erro":"falha interna"}');
    });
});
servidor.listen(ambiente.MCP_PORTA, () => {
  logger.info({ porta: ambiente.MCP_PORTA }, 'servidor MCP no ar');
});
