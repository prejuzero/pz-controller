import { expect, test } from '@playwright/test';

// Regressão visual (PZ-167): desktop e 360 px, temas claro e escuro. As referências só são geradas
// e comparadas no container do `pnpm e2e` (mesmo navegador e fontes do CI).
const TELAS = [
  { nome: 'desktop', viewport: { width: 1280, height: 800 } },
  { nome: '360', viewport: { width: 360, height: 780 } },
] as const;
const TEMAS = [
  { nome: 'claro', colorScheme: 'light' },
  { nome: 'escuro', colorScheme: 'dark' },
] as const;

for (const tela of TELAS) {
  for (const tema of TEMAS) {
    test.describe(`${tela.nome} ${tema.nome}`, () => {
      test.use({ viewport: tela.viewport, colorScheme: tema.colorScheme });

      test('dashboard', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expect(page).toHaveScreenshot(`dashboard-${tela.nome}-${tema.nome}.png`, {
          fullPage: true,
        });
      });

      test.describe('sem sessão', () => {
        test.use({ storageState: { cookies: [], origins: [] } });

        test('entrar', async ({ page }) => {
          await page.goto('/entrar');
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
          await expect(page).toHaveScreenshot(`entrar-${tela.nome}-${tema.nome}.png`, {
            fullPage: true,
          });
        });
      });
    });
  }
}
