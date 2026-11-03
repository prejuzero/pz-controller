import { COOKIE_SESSAO } from '@pz/contracts';
import { NextResponse, type NextRequest } from 'next/server';

import { ehRotaPublica, urlEntrar } from './rotas';
import { gerarNonce, politicaDeConteudo } from './seguranca';

const API_URL_PADRAO = 'http://localhost:3000';
const CAMINHO_FILAS = '/admin/filas';

/**
 * Rota protegida sem cookie de sessão vai para /entrar, preservando a URL. A sessão é opaca: quem
 * a valida é a API; sessão expirada aparece como 401 e é tratada no cliente (src/api/erros.ts).
 */
export function proxy(requisicao: NextRequest): NextResponse {
  const { pathname, search } = requisicao.nextUrl;
  // /v1 vai para a API na mesma origem (cookies __Host- e CSRF sem CORS, ADR-015). O destino é lido
  // em execução, não no build: a mesma imagem serve qualquer ambiente (12-factor, ADR-010).
  // O painel das filas (Bull Board, HU10) também é servido pela API, com a guarda dela.
  if (
    pathname.startsWith('/v1/') ||
    pathname === CAMINHO_FILAS ||
    pathname.startsWith(`${CAMINHO_FILAS}/`)
  ) {
    return NextResponse.rewrite(new URL(pathname + search, process.env.API_URL ?? API_URL_PADRAO));
  }
  if (ehRotaPublica(pathname) || requisicao.cookies.has(COOKIE_SESSAO))
    return comPolitica(requisicao);
  return NextResponse.redirect(new URL(urlEntrar(pathname + search), requisicao.url));
}

/**
 * CSP com nonce por requisição (HU37): o cabeçalho vai na requisição (o Next.js lê o nonce e o
 * aplica aos próprios scripts) e na resposta (o navegador aplica a política).
 */
function comPolitica(requisicao: NextRequest): NextResponse {
  const politica = politicaDeConteudo({
    nonce: gerarNonce(),
    desenvolvimento: process.env.NODE_ENV === 'development',
    sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  });
  const cabecalhos = new Headers(requisicao.headers);
  cabecalhos.set('content-security-policy', politica);
  const resposta = NextResponse.next({ request: { headers: cabecalhos } });
  resposta.headers.set('content-security-policy', politica);
  return resposta;
}

// Fora da sessão: /health, os arquivos do Next.js e arquivos estáticos (pela extensão). Rotas com
// ponto no meio (ex.: o token em /ciencia/v1.…) passam pelo proxy e recebem a CSP com nonce.
export const config = {
  matcher: [
    '/v1/:caminho*',
    '/admin/filas/:caminho*',
    '/((?!v1/|_next/|health/|.*\\.(?:ico|png|jpg|jpeg|svg|gif|webp|txt|xml|webmanifest|js|css|map|woff2?)$).*)',
  ],
};
