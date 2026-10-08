import { expect, test } from '@playwright/test';

// Exportação dos dados do titular (HU38), ponta a ponta: API → outbox → worker → RustFS.
test('exporta os dados do titular e mostra os links dos arquivos', async ({ page }) => {
  await page.goto('/configuracoes/privacidade');
  await expect(page.getByRole('heading', { level: 1, name: 'Privacidade' })).toBeVisible();
  const secao = page
    .getByRole('region', { name: 'Exportar meus dados' })
    .or(
      page
        .locator('section')
        .filter({ has: page.getByRole('heading', { name: 'Exportar meus dados' }) }),
    );
  await secao.getByRole('button', { name: 'Gerar exportação' }).click();
  await expect(secao.getByText(/Arquivos prontos até/)).toBeVisible({ timeout: 60_000 });
  await expect(secao.getByRole('link', { name: 'Baixar dados.json' })).toBeVisible();
  await expect(secao.getByRole('link', { name: 'Baixar dados.csv' })).toBeVisible();
});
