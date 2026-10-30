import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/** Preferências de notificação (HU31, PZ-198): grava e mantém após recarregar; sem violações. */
test('altera antecedências e horário do resumo', async ({ page }) => {
  await page.goto('/configuracoes');
  await page.getByRole('link', { name: /^Notificações/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Notificações' })).toBeVisible();
  await page.getByLabel('10 dias úteis antes').check();
  await page.getByLabel('Horário do resumo diário').fill('18:30');
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Preferências salvas.', { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('10 dias úteis antes')).toBeChecked();
  await expect(page.getByLabel('Horário do resumo diário')).toHaveValue('18:30');
});
