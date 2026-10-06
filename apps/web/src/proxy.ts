import { COOKIE_SESSAO } from '@pz/contracts';
import { NextResponse, type NextRequest } from 'next/server';

import { ehRotaPublica, urlEntrar } from './rotas';

/**
 * Rota protegida sem cookie de sessão vai para /entrar, preservando a URL. A sessão é opaca: quem
 * a valida é a API; sessão expirada aparece como 401 e é tratada no cliente (src/api/erros.ts).
 */
export function proxy(requisicao: NextRequest): NextResponse {
  const { pathname, search } = requisicao.nextUrl;
  if (ehRotaPublica(pathname) || requisicao.cookies.has(COOKIE_SESSAO)) return NextResponse.next();
  return NextResponse.redirect(new URL(urlEntrar(pathname + search), requisicao.url));
}

// Fora: a API encaminhada (/v1), os arquivos do Next.js e arquivos estáticos (com extensão).
export const config = { matcher: ['/((?!v1/|_next/|.*\\..*).*)'] };
