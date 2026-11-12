import { expect, test } from '@playwright/test';

import { ESTADO_CURADOR } from './apoio';

// Regra FICTÍCIA, única por execução (o banco local persiste entre rodadas).
const CODIGO = `ficticia-e2e-${String(Date.now())}`;

test.describe('curadoria das regras rápidas (PZ-313)', () => {
  test.use({ storageState: ESTADO_CURADOR });

  test('a curadora propõe, ativa a própria proposta e retira', async ({ page }) => {
    await page.goto('/prazos');
    const form = page.locator('form').filter({ hasText: 'Propor regra ou nova versão' });
    await form.getByLabel('Código').fill(CODIGO);
    await form.getByRole('combobox').click();
    await page.getByRole('option').first().click();
    await form.getByLabel('Padrões (um por linha)').fill('\\bfictici[ao] e2e\\b');
    await form.getByRole('button', { name: 'Propor' }).click();
    await expect(page.getByText(/Regra proposta/)).toBeVisible();
    const linha = page.getByRole('row').filter({ hasText: CODIGO });
    await linha.getByRole('button', { name: 'Ativar' }).click();
    await expect(linha.getByText('Ativa', { exact: true })).toBeVisible();
    await linha.getByRole('button', { name: 'Retirar' }).click();
    await expect(linha.getByText('Retirada', { exact: true })).toBeVisible();
  });
});
