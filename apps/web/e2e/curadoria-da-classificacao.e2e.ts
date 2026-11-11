import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { ESTADO_CURADOR } from './apoio';

test.describe('curadoria da classificação (PZ-336)', () => {
  test.use({ storageState: ESTADO_CURADOR });

  test('mostra a revisão manual e os candidatos e baixa os casos aceitos', async ({ page }) => {
    await page.goto('/prazos');
    await expect(page.getByRole('heading', { name: 'Curadoria da classificação' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Revisão manual' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Casos candidatos à avaliação' })).toBeVisible();
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Baixar casos aceitos (eval/casos)' }).click();
    expect((await download).suggestedFilename()).toBe('casos-aceitos.json');
  });
});
