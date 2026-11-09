import createClient, { type Client } from 'openapi-fetch';

import type { paths } from '@pz/contracts/gerado/api';

export type ClienteApi = Client<paths>;

/**
 * Cliente gerado do OpenAPI (CLAUDE.md, seção 12): o servidor MCP só chama a API, com o token do
 * próprio assistente. Escritório, usuário e permissões saem do token, do lado da API.
 */
export function clienteDaApi(
  baseUrl: string,
  token: string,
  meuFetch?: (requisicao: Request) => Promise<Response>,
): ClienteApi {
  return createClient<paths>({
    baseUrl,
    // Sem token: só as rotas públicas (metadados OAuth).
    headers: token === '' ? {} : { authorization: `Bearer ${token}` },
    ...(meuFetch === undefined ? {} : { fetch: meuFetch }),
  });
}
