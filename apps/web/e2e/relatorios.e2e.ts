import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Relatórios (HU29, PZ-190): pedido pela busca e pela tela de Relatórios, geração no worker,
 * aviso no portal e download do arquivo pelo link assinado. Dados do seed (FICTÍCIOS).
 */
test('exporta a busca e a agenda e baixa o arquivo quando fica pronto', async ({ page }) => {
  // A geração é assíncrona (worker): o teste espera mais que o padrão de 30 s.
  test.setTimeout(120_000);
  await page.goto('/busca?tribunal=TJGO');
  await page.getByRole('button', { name: 'Exportar Excel' }).click();
  await expect(page.getByText('Relatório solicitado.')).toBeVisible();

  await page.goto('/relatorios');
  await expect(page.getByRole('heading', { level: 1, name: 'Relatórios' })).toBeVisible();
  await page.getByRole('button', { name: 'Gerar relatório' }).click();
  const tabela = page.getByRole('table', { name: 'Gerados recentemente' });
  // Mais recentes primeiro: a agenda e, logo abaixo, a busca (execuções antigas ficam depois).
  const linhaDaAgenda = tabela.getByRole('row').nth(1);
  const linhaDaBusca = tabela.getByRole('row').nth(2);
  await expect(linhaDaAgenda).toContainText('Agenda de prazos');
  await expect(linhaDaBusca).toContainText('Busca de prazos');

  // O worker gera em segundo plano; a lista volta a consultar sozinha.
  await expect(linhaDaAgenda.getByRole('link', { name: 'Baixar' })).toBeVisible({
    timeout: 60_000,
  });
  await expect(linhaDaBusca.getByRole('link', { name: 'Baixar' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Relatório pronto.').first()).toBeVisible();
  // O link assinado (armazenamento) devolve o arquivo; o navegador pode abrir o PDF na aba.
  const href = await linhaDaAgenda.getByRole('link', { name: 'Baixar' }).getAttribute('href');
  const resposta = await page.request.get(href ?? '');
  expect(resposta.ok()).toBe(true);
  expect((await resposta.body()).subarray(0, 5).toString()).toBe('%PDF-');

  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
});
