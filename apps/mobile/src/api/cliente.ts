import createClient, { type Client } from 'openapi-fetch';

import type { paths } from '@pz/contracts/gerado/api';

export type ClienteApi = Client<paths>;

/** Plataforma no X-Cliente (docs/arquitetura/mobile.md, seção 10; versão mínima na HU63). */
export const PLATAFORMA = 'mobile';

export interface OpcoesDoCliente {
  readonly baseUrl: string;
  /** Versão do app (app.config.ts), sempre "maior.menor.correção". */
  readonly versao: string;
  /** Token de acesso em memória (HU65); sem ele, só as rotas públicas. */
  readonly token?: () => string | undefined;
  readonly fetch?: (requisicao: Request) => Promise<Response>;
}

/**
 * Cliente gerado do OpenAPI (CLAUDE.md, seção 12): o app só fala com a API /v1. Toda chamada leva
 * `X-Cliente: mobile/<versão>`, que a API usa nos logs e para pedir atualização (426).
 */
export function criarCliente(opcoes: OpcoesDoCliente): ClienteApi {
  const cliente = createClient<paths>({
    baseUrl: opcoes.baseUrl,
    headers: { 'x-cliente': `${PLATAFORMA}/${opcoes.versao}` },
    ...(opcoes.fetch === undefined ? {} : { fetch: opcoes.fetch }),
  });
  cliente.use({
    onRequest: ({ request }) => {
      const token = opcoes.token?.();
      if (token !== undefined) request.headers.set('authorization', `Bearer ${token}`);
      return request;
    },
  });
  return cliente;
}

/** A API pediu atualização do app (versão abaixo da mínima). */
export const precisaAtualizar = (resposta: Response) => resposta.status === 426;
