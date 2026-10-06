import { randomBytes, timingSafeEqual } from 'node:crypto';

import { DURACAO_MAXIMA_MS } from '@pz/identidade';

/**
 * Prefixo `__Host-`: o navegador só aceita o cookie com Secure, Path=/ e sem Domain (não pode
 * ser plantado por subdomínio). `localhost` conta como contexto seguro no desenvolvimento.
 */
export const COOKIE_SESSAO = '__Host-pz_sessao';
export const COOKIE_CSRF = '__Host-pz_csrf';
export const CABECALHO_CSRF = 'x-csrf-token';

export function lerCookies(cabecalho: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const parte of (cabecalho ?? '').split(';')) {
    const separador = parte.indexOf('=');
    if (separador > 0)
      cookies.set(parte.slice(0, separador).trim(), parte.slice(separador + 1).trim());
  }
  return cookies;
}

const maxAge = Math.floor(DURACAO_MAXIMA_MS / 1000);

/** Cookie da sessão: inacessível ao JavaScript (HttpOnly). */
export function cookieDeSessao(token: string): string {
  return `${COOKIE_SESSAO}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${String(maxAge)}`;
}

/** Cookie CSRF (double-submit): legível pelo portal, que o repete no cabeçalho `x-csrf-token`. */
export function cookieCsrf(): string {
  return `${COOKIE_CSRF}=${randomBytes(32).toString('base64url')}; Path=/; Secure; SameSite=Lax; Max-Age=${String(maxAge)}`;
}

export function cookiesApagados(): string[] {
  return [COOKIE_SESSAO, COOKIE_CSRF].map(
    (nome) => `${nome}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
}

export function iguaisEmTempoConstante(a: string, b: string): boolean {
  const [x, y] = [Buffer.from(a), Buffer.from(b)];
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}
