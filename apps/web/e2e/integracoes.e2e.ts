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
