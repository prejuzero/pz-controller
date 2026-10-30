import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/** Dashboard (HU26, PZ-178): cada card abre a lista com o filtro certo; celular em coluna. */
const CARDS = [
  {
    nome: 'Prazos sem ciência confirmada',
    url: '/prazos?recorte=sem-ciencia',
    selo: 'Sem ciência confirmada',
  },
  { nome: 'Vencem hoje', url: '/prazos?recorte=vence-hoje', selo: 'Vencem hoje' },
  { nome: 'Próximos 7 dias', url: '/prazos?recorte=proximos-7-dias', selo: 'Próximos 7 dias' },
  {
    nome: 'Vencidos não cumpridos',
    url: '/prazos?recorte=vencidos',
    selo: 'Vencidos não cumpridos',
  },
] as const;

test('cada card abre a lista com o filtro correto', async ({ page }) => {
  for (const card of CARDS) {
    await page.goto('/');
    await page.getByRole('link', { name: new RegExp(`^${card.nome}`) }).click();
    await expect(page).toHaveURL(card.url);
    await expect(page.getByText(card.selo, { exact: true }).first()).toBeVisible();
  }
  await page.goto('/');
  await page.getByRole('link', { name: /^Aguardando confirmação/ }).click();
  await expect(page).toHaveURL('/prazos?status=a-confirmar');
  await expect(page.getByRole('button', { name: 'A confirmar', pressed: true })).toBeVisible();

  await page.goto('/');
  await page.getByRole('link', { name: /^Novas publicações/ }).click();
  await expect(page).toHaveURL('/publicacoes?novas=true');

  await page.goto('/');
  await page.getByRole('link', { name: /^Processos monitorados/ }).click();
  await expect(page).toHaveURL('/processos');
});

test.describe('celular', () => {
  test.use({ viewport: { width: 360, height: 780 } });

  test('cards em coluna, sem rolagem horizontal e sem violações de acessibilidade', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 2, name: 'Próximos prazos' })).toBeVisible();
    await expect(page.locator('.animate-pulse')).toHaveCount(0);
    const larguras = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ]);
    expect(larguras[0]).toBeLessThanOrEqual(larguras[1] ?? 0);
    // Linha do tempo com alternativa textual para leitores de tela.
    await expect(page.getByRole('table', { name: 'Prazos nos próximos 30 dias' })).toHaveCount(1);
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});
