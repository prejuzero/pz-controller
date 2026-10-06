import { COOKIE_SESSAO } from '@pz/contracts';
import { NextResponse, type NextRequest } from 'next/server';

import { ehRotaPublica, urlEntrar } from './rotas';

const API_URL_PADRAO = 'http://localhost:3000';

/**
 * Rota protegida sem cookie de sessão vai para /entrar, preservando a URL. A sessão é opaca: quem
 * a valida é a API; sessão expirada aparece como 401 e é tratada no cliente (src/api/erros.ts).
 */
export function proxy(requisicao: NextRequest): NextResponse {
  const { pathname, search } = requisicao.nextUrl;
  // /v1 vai para a API na mesma origem (cookies __Host- e CSRF sem CORS, ADR-015). O destino é lido
  // em execução, não no build: a mesma imagem serve qualquer ambiente (12-factor, ADR-010).
  if (pathname.startsWith('/v1/')) {
    return NextResponse.rewrite(new URL(pathname + search, process.env.API_URL ?? API_URL_PADRAO));
  }
  if (ehRotaPublica(pathname) || requisicao.cookies.has(COOKIE_SESSAO)) return NextResponse.next();
  return NextResponse.redirect(new URL(urlEntrar(pathname + search), requisicao.url));
}

// Fora da sessão: /health, os arquivos do Next.js e arquivos estáticos (com extensão).
export const config = { matcher: ['/v1/:caminho*', '/((?!v1/|_next/|health/|.*\\..*).*)'] };
