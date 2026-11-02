import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { CABECALHO_CSRF, COOKIE_CSRF } from '@pz/contracts';

/**
 * Calendário e filtro global (HU27, PZ-181). O navegador fica em Nova York (UTC−5): o compromisso
 * às 00:30 de Brasília tem que aparecer no dia de Brasília, não no dia anterior do navegador.
 * Dados FICTÍCIOS.
 */
test.use({ timezoneId: 'America/New_York' });

/** 10/03/2027 00:30 em Brasília (UTC−3) = 09/03/2027 22:30 em Nova York. */
const INSTANTE = '2027-03-10T03:30:00.000Z';

/** Agenda pela API com a sessão do navegador (o mesmo cookie e o CSRF do portal). */
async function agendar(page: Page, titulo: string) {
  const csrf = (await page.context().cookies()).find((c) => c.name === COOKIE_CSRF)?.value ?? '';
  const resposta = await page.request.post('/v1/compromissos', {
    headers: { [CABECALHO_CSRF]: decodeURIComponent(csrf) },
    data: { titulo, dataHora: INSTANTE },
  });
  expect(resposta.status()).toBe(201);
}

test('mostra o compromisso no dia e na hora de Brasília em outro fuso', async ({ page }) => {
  const titulo = `Audiência fictícia ${String(Date.now())}`;
  await page.goto('/calendario');
  await agendar(page, titulo);

  await page.goto('/calendario?data=2027-03-01');
  await expect(page.getByRole('heading', { level: 2, name: /março de 2027/i })).toBeVisible();
  const dia10 = page.locator('[data-testid="grade-calendario"] [data-dia="2027-03-10"]');
  await expect(dia10.getByText(`00:30 ${titulo}`)).toBeVisible();
  await expect(
    page.locator('[data-testid="grade-calendario"] [data-dia="2027-03-09"]').getByText(titulo),
  ).toHaveCount(0);

  // Visão semanal: a semana da data da URL (01/03) e, com "Próximo", a de 07 a 13/03.
  await page.getByRole('button', { name: 'Semana' }).click();
  await expect(page).toHaveURL(/visao=semana/);
  await expect(
    page.getByRole('heading', { level: 2, name: '28/02/2027 – 06/03/2027' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Próximo' }).click();
  await expect(
    page.getByRole('heading', { level: 2, name: '07/03/2027 – 13/03/2027' }),
  ).toBeVisible();
  await expect(dia10.getByText(`00:30 ${titulo}`)).toBeVisible();
});

test('o filtro global fica na URL, sobrevive ao recarregar e acompanha o menu', async ({
  page,
}) => {
  await page.goto('/calendario');
  const tribunal = page.getByTestId('filtro-global').getByLabel('Tribunal');
  await tribunal.fill('tjgo');
  await tribunal.press('Enter');
  await expect(page).toHaveURL(/tribunal=TJGO/);

  await page.reload();
  await expect(page.getByTestId('filtro-global').getByLabel('Tribunal')).toHaveValue('TJGO');

  await page.getByRole('navigation').getByRole('link', { name: 'Dashboard' }).first().click();
  await expect(page).toHaveURL('/?tribunal=TJGO');
  await expect(page.getByTestId('filtro-global').getByLabel('Tribunal')).toHaveValue('TJGO');

  // A lista de prazos ainda não filtra por tribunal e avisa, mantendo o filtro na URL.
  await page.getByRole('navigation').getByRole('link', { name: 'Prazos' }).first().click();
  await expect(page).toHaveURL('/prazos?tribunal=TJGO');
  await expect(page.getByText('Nesta tela o filtro não usa: Tribunal.')).toBeVisible();

  await page.getByRole('navigation').getByRole('link', { name: 'Calendário' }).first().click();
  await page.getByRole('button', { name: 'Limpar filtro' }).click();
  await expect(page).toHaveURL('/calendario');
});

test.describe('celular', () => {
  test.use({ viewport: { width: 360, height: 780 } });

  test('lista por dia, sem rolagem horizontal e sem violações de acessibilidade', async ({
    page,
  }) => {
    await page.goto('/calendario?data=2027-03-01');
    await expect(page.getByTestId('lista-calendario')).toBeVisible();
    await expect(page.getByTestId('grade-calendario')).toBeHidden();
    const larguras = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ]);
    expect(larguras[0]).toBeLessThanOrEqual(larguras[1] ?? 0);
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});
