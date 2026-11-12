import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { aguardarAnimacoes, ESTADO_CURADOR } from './apoio';

// Taxonomia e versão FICTÍCIAS, únicas por execução (o banco local persiste entre rodadas).
const SUFIXO = String(Date.now());
const CODIGO = `ficticio-e2e-${SUFIXO}`;
const NOME = `FICTÍCIO E2E ${SUFIXO}`;

/**
 * Linha do ato fictício: o banco local acumula atos de execuções anteriores e a tabela pagina,
 * então percorre as páginas até achar.
 */
async function linhaDoAto(page: Page) {
  const linha = page.getByRole('row').filter({ hasText: NOME });
  await expect(page.getByRole('table').first()).toBeVisible();
  for (let i = 0; i < 20 && (await linha.count()) === 0; i++) {
    const proxima = page.getByRole('button', { name: 'Próxima página' });
    if ((await proxima.count()) === 0 || (await proxima.isDisabled())) break;
    await proxima.click();
  }
  return linha;
}

async function semViolacoes(page: Page): Promise<void> {
  await aguardarAnimacoes(page);
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
}

test.describe('curadoria da tabela de prazos (HU15)', () => {
  test.use({ storageState: ESTADO_CURADOR });

  test('propõe a versão e a própria curadora aprova', async ({ page }) => {
    await page.goto('/prazos');
    await expect(page.getByRole('heading', { level: 1, name: 'Tabela de prazos' })).toBeVisible();
    await semViolacoes(page);

    await page.getByRole('button', { name: 'Novo tipo de ato' }).click();
    let dialogo = page.getByRole('dialog');
    await dialogo.getByLabel('Código').fill(CODIGO);
    await dialogo.getByLabel('Nome').fill(NOME);
    await dialogo.getByRole('button', { name: 'Cadastrar' }).click();
    await expect(page.getByText('Tipo de ato cadastrado.')).toBeVisible();

    await page.getByRole('button', { name: 'Propor versão' }).click();
    dialogo = page.getByRole('dialog');
    await semViolacoes(page);
    await dialogo.getByRole('combobox', { name: 'Tipo de ato' }).click();
    await page.getByRole('option', { name: NOME }).click();
    await dialogo.getByLabel('Quantidade').fill('15');
    await dialogo.getByRole('button', { name: /Vigência a partir de/ }).click();
    // Dia 1º do mês corrente: já começou, então a versão aprovada aparece como vigente hoje.
    await page
      .getByRole('button', { name: /, 1 de / })
      .first()
      .click();
    await dialogo.getByLabel('Fundamento legal').fill('FICTÍCIO: Lei de Teste, art. 1º');
    await dialogo.getByLabel('Link da fonte oficial').fill('https://exemplo.invalid/ficticio');
    await dialogo.getByRole('button', { name: 'Propor' }).click();
    await expect(page.getByText(/Versão proposta/)).toBeVisible();

    const linha = await linhaDoAto(page);
    await linha.getByRole('button', { name: 'Histórico' }).click();
    const historico = page.getByRole('dialog');
    await historico.getByRole('button', { name: 'Aprovar' }).click();
    await expect(page.getByText('Versão aprovada.')).toBeVisible();

    // A coluna "Vigente hoje" é marcada pela API na data do servidor (PZ-298).
    await page.reload();
    await expect((await linhaDoAto(page)).getByText('FICTÍCIO: Lei de Teste')).toBeVisible();
  });
});
