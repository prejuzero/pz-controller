import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/** Link de ciência (HU33, PZ-206): público, fora dos buscadores; link inválido orienta. */
test.describe('sem sessão', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('link inválido não confirma nada e orienta a usar o portal', async ({ page }) => {
    await page.goto('/ciencia/v1.invalido.ficticio');
    await expect(page.getByRole('heading', { level: 1, name: 'Confirmar ciência' })).toBeVisible();
    await expect(page.getByText('Link inválido. Confirme a ciência pelo portal.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirmar ciência' })).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});
