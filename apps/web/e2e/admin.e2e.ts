import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { aguardarAnimacoes, ESTADO_ADMIN, ESTADO_SESSAO } from './apoio';

async function semViolacoes(page: Page): Promise<void> {
  await aguardarAnimacoes(page);
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
}

test.describe('painel do administrador (HU39)', () => {
  test.describe('administrador da plataforma', () => {
    test.use({ storageState: ESTADO_ADMIN });

    test('escritórios, integrações e e-mails rejeitados, sem violações de acessibilidade', async ({
      page,
    }) => {
      await page.goto('/admin');
      await expect(
        page.getByRole('heading', { level: 1, name: 'Administração da plataforma' }),
      ).toBeVisible();
      await expect(page.getByRole('cell', { name: 'Escritório Demonstração' })).toBeVisible();
      await semViolacoes(page);

      const linha = page.getByRole('row').filter({ hasText: 'Escritório Demonstração' });
      await linha.getByRole('button', { name: 'Gerenciar' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await semViolacoes(page);
      await page.keyboard.press('Escape');

      await page.getByRole('link', { name: 'Integrações e filas' }).click();
      await expect(page.getByRole('heading', { name: 'Filas' })).toBeVisible();
      await semViolacoes(page);

      await page.getByRole('link', { name: 'E-mails rejeitados' }).click();
      await expect(page.getByText(/deixaram de receber e-mails/)).toBeVisible();
      await semViolacoes(page);

      // Documentos legais (PZ-303): prévia igual à página pública; publicar exige confirmação.
      // Não publica aqui: uma versão nova exigiria novo aceite de todos nos testes seguintes.
      await page.getByRole('link', { name: 'Documentos legais' }).click();
      const publicar = page.getByRole('button', { name: 'Publicar nova versão' });
      await page.getByLabel('Versão', { exact: true }).fill('99.0');
      await page.getByLabel('Texto do documento').fill('Texto FICTÍCIO da prévia.');
      await expect(
        page.getByRole('region', { name: 'Prévia' }).getByText('Texto FICTÍCIO da prévia.'),
      ).toBeVisible();
      await expect(publicar).toBeDisabled();
      await page.getByRole('checkbox').check();
      await expect(publicar).toBeEnabled();
      await semViolacoes(page);
    });
  });

  test.describe('outro perfil', () => {
    test.use({ storageState: ESTADO_SESSAO });

    test('não vê o item no menu e recebe acesso negado na URL', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('link', { name: 'Administração' })).toHaveCount(0);
      await page.goto('/admin');
      await expect(page.getByRole('heading', { name: 'Administração da plataforma' })).toHaveCount(
        0,
      );
    });
  });
});
