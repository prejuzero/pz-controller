import { expect, test } from '@playwright/test';

/**
 * Cabeçalhos de segurança do portal e da API (HU37, PZ-218): CSP com nonce que muda a cada
 * requisição, sem nenhuma violação ao navegar (os scripts do Next.js levam o nonce).
 */
test('portal e API respondem com os cabeçalhos de segurança, sem violar a CSP', async ({
  page,
}) => {
  const violacoes: string[] = [];
  page.on('console', (mensagem) => {
    if (/Content Security Policy/i.test(mensagem.text())) violacoes.push(mensagem.text());
  });
  const resposta = await page.goto('/');
  const cabecalhos = resposta?.headers() ?? {};
  expect(cabecalhos['content-security-policy']).toMatch(/script-src 'self' 'nonce-[^']+'/);
  expect(cabecalhos['x-content-type-options']).toBe('nosniff');
  expect(cabecalhos['x-frame-options']).toBe('DENY');
  expect(cabecalhos['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(cabecalhos['permissions-policy']).toContain('camera=()');
  expect(cabecalhos['strict-transport-security']).toContain('max-age=63072000');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.goto('/prazos');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(violacoes).toEqual([]);

  const outra = await page.request.get('/');
  expect(outra.headers()['content-security-policy']).not.toBe(
    cabecalhos['content-security-policy'],
  );

  const api = await page.request.get('/v1/auth/eu');
  expect(api.headers()).toMatchObject({
    'x-content-type-options': 'nosniff',
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  });
});
