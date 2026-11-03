/**
 * Cabeçalhos de segurança do portal (HU37, PZ-218; OWASP ASVS nível 2, CLAUDE.md seção 14).
 * A CSP leva um nonce por requisição (gerado em src/proxy.ts): o Next.js o aplica aos próprios
 * scripts, e nenhum script sem o nonce roda. Estilos inline continuam permitidos (Tailwind e
 * Radix usam atributos `style`); scripts, não.
 */
export interface OpcoesDaPolitica {
  readonly nonce: string;
  /** Desenvolvimento: o recarregamento do webpack precisa de `eval` e de websocket. */
  readonly desenvolvimento: boolean;
  /** DSN do Sentry no navegador, quando configurado: a origem entra em connect-src. */
  readonly sentryDsn?: string | undefined;
}

export function politicaDeConteudo({
  nonce,
  desenvolvimento,
  sentryDsn,
}: OpcoesDaPolitica): string {
  const conexoes = ["'self'"];
  const sentry = origemDe(sentryDsn);
  if (sentry !== undefined) conexoes.push(sentry);
  if (desenvolvimento) conexoes.push('ws:');
  const diretivas: [string, ...string[]][] = [
    ['default-src', "'self'"],
    [
      'script-src',
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(desenvolvimento ? ["'unsafe-eval'"] : []),
    ],
    ['style-src', "'self'", "'unsafe-inline'"],
    ['img-src', "'self'", 'data:', 'blob:'],
    ['font-src', "'self'"],
    ['connect-src', ...conexoes],
    ['object-src', "'none'"],
    ['base-uri', "'self'"],
    ['form-action', "'self'"],
    ['frame-ancestors', "'none'"],
    ...(desenvolvimento ? [] : ([['upgrade-insecure-requests']] as [string][])),
  ];
  return diretivas.map((d) => d.join(' ')).join('; ');
}

function origemDe(url: string | undefined): string | undefined {
  if (url === undefined || url === '') return undefined;
  try {
    return new URL(url).origin;
  } catch {
    // DSN malformado: o monitoramento também não liga (src/monitoramento.ts); nada a liberar.
    return undefined;
  }
}

/** Cabeçalhos fixos de toda resposta do portal (next.config.ts). */
export const CABECALHOS_DE_SEGURANCA: readonly { key: string; value: string }[] = [
  // Dois anos, com subdomínios: o portal só existe em HTTPS (o navegador ignora em http://localhost).
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

/** Nonce aleatório (128 bits, base64) por requisição. */
export function gerarNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
