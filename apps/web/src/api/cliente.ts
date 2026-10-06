import { CABECALHO_CSRF, COOKIE_CSRF } from '@pz/contracts';
import createClient, { type Client } from 'openapi-fetch';

import { paraErroApi } from './erros';

import type { paths } from '@pz/contracts/gerado/api';

export type ClienteApi = Client<paths>;

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface OpcoesCliente {
  /** Vazio no navegador: a API responde na mesma origem (/v1, encaminhado pelo Next.js). */
  baseUrl?: string;
  /** Substituível nos testes. */
  fetch?: (requisicao: Request) => Promise<Response>;
  /** Fonte dos cookies legíveis (o de sessão é HttpOnly; só o CSRF é lido). */
  lerCookies?: () => string;
}

export function lerCookie(cookies: string, nome: string): string | undefined {
  for (const parte of cookies.split(';')) {
    const separador = parte.indexOf('=');
    if (separador > 0 && parte.slice(0, separador).trim() === nome)
      return decodeURIComponent(parte.slice(separador + 1).trim());
  }
  return undefined;
}

/**
 * Único ponto de acesso HTTP do portal (regra de lint: nada de fetch manual). Repete o token CSRF
 * do cookie no cabeçalho em métodos que alteram estado (double-submit, HU06).
 */
export function criarCliente(opcoes: OpcoesCliente = {}): ClienteApi {
  const lerCookies = opcoes.lerCookies ?? (() => document.cookie);
  const cliente = createClient<paths>({
    baseUrl: opcoes.baseUrl ?? '',
    credentials: 'same-origin',
    ...(opcoes.fetch === undefined ? {} : { fetch: opcoes.fetch }),
  });
  cliente.use({
    onRequest({ request }) {
      if (METODOS_SEGUROS.has(request.method)) return undefined;
      const token = lerCookie(lerCookies(), COOKIE_CSRF);
      if (token !== undefined) request.headers.set(CABECALHO_CSRF, token);
      return request;
    },
  });
  return cliente;
}

interface RespostaApi<Dados> {
  data?: Dados;
  error?: unknown;
  response: Response;
}

/** Devolve os dados da resposta ou lança `ErroApi` (problem+json validado). */
export async function exigir<Dados>(chamada: Promise<RespostaApi<Dados>>): Promise<Dados> {
  const { data, error, response } = await chamada;
  if (!response.ok) throw paraErroApi(response.status, error);
  // 2xx sem corpo (204) chega como undefined; o tipo gerado já o declara assim nessas rotas.
  return data as Dados;
}
