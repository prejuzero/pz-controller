import { createHash, randomBytes } from 'node:crypto';

import { expect, test } from '@playwright/test';

// Integrações (HU49): cliente da API e webhook de saída, com o segredo mostrado uma única vez.
test('cria e revoga uma integração e um webhook; o segredo aparece só na criação', async ({
  page,
}) => {
  const sufixo = String(Date.now());
  await page.goto('/configuracoes/integracoes');
  await expect(page.getByRole('heading', { level: 1, name: 'Integrações' })).toBeVisible();

  await page.getByRole('button', { name: 'Nova integração' }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Nome').fill(`ERP fictício ${sufixo}`);
  await dialogo.getByRole('checkbox', { name: /prazos:ler/ }).check();
  await dialogo.getByRole('button', { name: 'Criar integração' }).click();
  await expect(dialogo.getByRole('heading', { name: 'Integração criada' })).toBeVisible();
  const segredo = (await dialogo.locator('code').nth(1).textContent()) ?? '';
  expect(segredo.length).toBeGreaterThan(20);
  await page.keyboard.press('Escape');
  const linha = page.getByRole('row', { name: new RegExp(`ERP fictício ${sufixo}`) });
  await expect(linha).toBeVisible();
  await expect(page.getByText(segredo)).toHaveCount(0);
  await linha.getByRole('button', { name: 'Revogar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Revogar' }).click();
  await expect(linha.getByText('Revogado')).toBeVisible();

  await page.getByRole('button', { name: 'Novo webhook' }).click();
  const novo = page.getByRole('dialog');
  await novo.getByLabel('Descrição').fill(`Receptor fictício ${sufixo}`);
  await novo.getByLabel('Endereço (URL)').fill('https://erp.exemplo.invalid/webhooks');
  await novo.getByRole('checkbox', { name: /prazo\.confirmado/ }).check();
  await novo.getByRole('button', { name: 'Criar webhook' }).click();
  await expect(novo.getByText(/^whsec_/)).toBeVisible();
  await page.keyboard.press('Escape');
  const webhook = page.getByRole('row', { name: new RegExp(`Receptor fictício ${sufixo}`) });
  await webhook.getByRole('button', { name: 'Testar' }).click();
  await expect(page.getByRole('cell', { name: 'webhook.teste' }).first()).toBeVisible();
  await webhook.getByRole('button', { name: 'Desativar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Desativar' }).click();
  await expect(webhook.getByText('Desativado')).toBeVisible();
});

// Authorization Code + PKCE (HU49): o app pede, o advogado permite no portal e o app troca o código.
test('app público: consentimento no portal e troca do código com PKCE', async ({ page }) => {
  const sufixo = String(Date.now());
  const retorno = 'http://localhost:8765/retorno';
  await page.goto('/configuracoes/integracoes');
  await page.getByRole('button', { name: 'Novo app' }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Nome').fill(`Assistente fictício ${sufixo}`);
  await dialogo.getByRole('checkbox', { name: /prazos:ler/ }).check();
  await dialogo.getByLabel('Endereços de retorno').fill(retorno);
  await dialogo.getByRole('button', { name: 'Criar app' }).click();
  await expect(dialogo.getByRole('heading', { name: 'App criado' })).toBeVisible();
  const clienteId = ((await dialogo.locator('code').textContent()) ?? '').trim();
  await page.keyboard.press('Escape');

  const verificador = randomBytes(32).toString('base64url');
  const desafio = createHash('sha256').update(verificador).digest('base64url');
  const pedido = new URLSearchParams({
    response_type: 'code',
    client_id: clienteId,
    redirect_uri: retorno,
    scope: 'prazos:ler',
    state: 'estado-e2e',
    code_challenge: desafio,
    code_challenge_method: 'S256',
  });
  await page.goto(`/oauth/autorizar?${pedido.toString()}`);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: `Assistente fictício ${sufixo} quer acessar sua conta no PrejuZero`,
    }),
  ).toBeVisible();
  // O retorno não tem servidor: basta ver o navegador sair para ele com o código.
  const saida = page.waitForRequest((r) => r.url().startsWith(`${retorno}?`));
  await page.getByRole('button', { name: 'Permitir' }).click();
  const destino = new URL((await saida).url());
  expect(destino.searchParams.get('state')).toBe('estado-e2e');

  const token = await page.request.post('/v1/oauth/token', {
    form: {
      grant_type: 'authorization_code',
      client_id: clienteId,
      code: destino.searchParams.get('code') ?? '',
      redirect_uri: retorno,
      code_verifier: verificador,
    },
  });
  expect(token.status()).toBe(200);
  const corpo = (await token.json()) as { scope: string; refresh_token?: string };
  expect(corpo.scope).toBe('prazos:ler');
  expect(corpo.refresh_token).toBeDefined();
});
