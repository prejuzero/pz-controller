import { expect, test } from '@playwright/test';

import { CURADOR_2, entrar, ESTADO_CURADOR, SENHA } from './apoio';

// Regra FICTÍCIA, única por execução (o banco local persiste entre rodadas).
const CODIGO = `ficticia-e2e-${String(Date.now())}`;

test.describe('curadoria das regras rápidas (PZ-313)', () => {
  test.use({ storageState: ESTADO_CURADOR });

  test('uma curadora propõe, a outra ativa e retira', async ({ page, browser }) => {
    await page.goto('/prazos');
    const form = page.locator('form').filter({ hasText: 'Propor regra ou nova versão' });
    await form.getByLabel('Código').fill(CODIGO);
    await form.getByRole('combobox').click();
    await page.getByRole('option').first().click();
    await form.getByLabel('Padrões (um por linha)').fill('\\bfictici[ao] e2e\\b');
    await form.getByRole('button', { name: 'Propor' }).click();
    await expect(page.getByText(/Regra proposta/)).toBeVisible();
    const linha = page.getByRole('row').filter({ hasText: CODIGO });
    await expect(linha.getByText('Sua proposta: outra curadora ativa')).toBeVisible();

    const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const outra = await contexto.newPage();
    await outra.goto('/entrar');
    await entrar(outra, SENHA, CURADOR_2);
    await outra.goto('/prazos');
    const daOutra = outra.getByRole('row').filter({ hasText: CODIGO });
    await daOutra.getByRole('button', { name: 'Ativar' }).click();
    await expect(daOutra.getByText('Ativa', { exact: true })).toBeVisible();
    await daOutra.getByRole('button', { name: 'Retirar' }).click();
    await expect(daOutra.getByText('Retirada', { exact: true })).toBeVisible();
    await contexto.close();
  });
});
