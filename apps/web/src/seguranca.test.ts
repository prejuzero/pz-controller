import { describe, expect, it } from 'vitest';

import { CABECALHOS_DE_SEGURANCA, gerarNonce, politicaDeConteudo } from './seguranca';

describe('cabeçalhos de segurança do portal (HU37)', () => {
  it('CSP estrita em produção: scripts só com nonce, sem frame e sem eval', () => {
    const csp = politicaDeConteudo({ nonce: 'abc', desenvolvimento: false });
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("connect-src 'self';");
    expect(csp).toContain('upgrade-insecure-requests');
    expect(csp).not.toContain('unsafe-eval');
  });

  it('desenvolvimento libera eval e websocket; Sentry entra em connect-src', () => {
    const csp = politicaDeConteudo({
      nonce: 'n',
      desenvolvimento: true,
      sentryDsn: 'https://chave@o123.ingest.sentry.io/456',
    });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("connect-src 'self' https://o123.ingest.sentry.io ws:");
    expect(csp).not.toContain('upgrade-insecure-requests');
    expect(politicaDeConteudo({ nonce: 'n', desenvolvimento: false, sentryDsn: 'nada' })).toContain(
      "connect-src 'self';",
    );
    expect(politicaDeConteudo({ nonce: 'n', desenvolvimento: false, sentryDsn: '' })).toContain(
      "connect-src 'self';",
    );
  });

  it('nonce novo a cada requisição e cabeçalhos fixos', () => {
    expect(gerarNonce()).not.toBe(gerarNonce());
    expect(gerarNonce()).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(CABECALHOS_DE_SEGURANCA.map((c) => c.key)).toEqual([
      'Strict-Transport-Security',
      'X-Content-Type-Options',
      'X-Frame-Options',
      'Referrer-Policy',
      'Permissions-Policy',
      'Cross-Origin-Opener-Policy',
    ]);
  });
});
