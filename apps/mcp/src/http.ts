import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { criarLogger } from '@pz/observability';

import { clienteDaApi } from './cliente-api.js';
import { criarServidorMcp } from './servidor.js';

const logger = criarLogger('mcp.http');
export const CAMINHO_MCP = '/mcp';

export interface OpcoesDoMcp {
  readonly apiUrl: string;
  readonly versao: string;
  /** Testes: a API em memória. */
  readonly fetch?: (requisicao: Request) => Promise<Response>;
}

const json = (status: number, corpo: unknown, cabecalhos: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json', ...cabecalhos },
  });

function tokenDe(requisicao: Request): string | undefined {
  const cabecalho = requisicao.headers.get('authorization') ?? '';
  const [esquema, token] = cabecalho.split(' ');
  return esquema?.toLowerCase() === 'bearer' && token !== undefined && token !== ''
    ? token
    : undefined;
}

/**
 * Borda HTTP do servidor MCP (Streamable HTTP, sem estado): cada requisição traz o token OAuth do
 * assistente, conferido pela API antes de abrir o protocolo; sem token válido, 401 para o
 * assistente iniciar a autorização. GET e DELETE (sessões e notificações do servidor) não existem
 * no modo sem estado.
 */
export function criarAppMcp(opcoes: OpcoesDoMcp): (requisicao: Request) => Promise<Response> {
  return async (requisicao) => {
    const caminho = new URL(requisicao.url).pathname;
    if (caminho === '/health/live') return json(200, { estado: 'operacional' });
    if (caminho !== CAMINHO_MCP) return json(404, { erro: 'não encontrado' });
    if (requisicao.method !== 'POST') {
      return json(405, { erro: 'Use POST (servidor sem estado).' }, { allow: 'POST' });
    }
    const token = tokenDe(requisicao);
    const naoAutorizado = () =>
      json(401, { erro: 'Token ausente ou inválido.' }, { 'www-authenticate': 'Bearer' });
    if (token === undefined) return naoAutorizado();
    const api = clienteDaApi(opcoes.apiUrl, token, opcoes.fetch);
    const { response } = await api.GET('/v1/auth/eu');
    if (response.status === 401) return naoAutorizado();
    if (!response.ok) {
      logger.error({ status: response.status }, 'API indisponível para o servidor MCP');
      return json(502, { erro: 'API indisponível.' });
    }
    // Sem `sessionIdGenerator`: modo sem estado (cada POST é independente).
    const transporte = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
    const servidor = criarServidorMcp(api, opcoes.versao);
    await servidor.connect(transporte);
    try {
      return await transporte.handleRequest(requisicao);
    } finally {
      await servidor.close();
    }
  };
}
