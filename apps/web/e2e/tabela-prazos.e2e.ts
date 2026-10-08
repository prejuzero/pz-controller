import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { aguardarAnimacoes, CURADOR_2, entrar, ESTADO_CURADOR, SENHA } from './apoio';

// Taxonomia e versão FICTÍCIAS, únicas por execução (o banco local persiste entre rodadas).
const SUFIXO = String(Date.now());
const CODIGO = `ficticio-e2e-${SUFIXO}`;
const NOME = `FICTÍCIO E2E ${SUFIXO}`;

async function semViolacoes(page: Page): Promise<void> {
  await aguardarAnimacoes(page);
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
}

test.describe('curadoria da tabela de prazos (HU15)', () => {
  test.use({ storageState: ESTADO_CURADOR });

  test('propõe a versão, não aprova a própria e outro curador aprova', async ({
    page,
    browser,
  }) => {
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
    await page.getByRole('button', { name: /15 de/ }).first().click();
    await dialogo.getByLabel('Fundamento legal').fill('FICTÍCIO: Lei de Teste, art. 1º');
    await dialogo.getByLabel('Link da fonte oficial').fill('https://exemplo.invalid/ficticio');
    await dialogo.getByRole('button', { name: 'Propor' }).click();
    await expect(page.getByText(/Versão proposta/)).toBeVisible();

    const linha = page.getByRole('row').filter({ hasText: NOME });
    await linha.getByRole('button', { name: 'Histórico' }).click();
    const historico = page.getByRole('dialog');
    await expect(historico.getByRole('button', { name: 'Aprovar' })).toBeDisabled();
    await expect(historico.getByText('Quem propôs não pode aprovar')).toBeVisible();

    // Quatro olhos: o segundo curador aprova.
    const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const outro = await contexto.newPage();
    await outro.goto('/entrar');
    await entrar(outro, SENHA, CURADOR_2);
    await outro.goto('/prazos');
    await outro
      .getByRole('row')
      .filter({ hasText: NOME })
      .getByRole('button', { name: 'Histórico' })
      .click();
    await outro.getByRole('dialog').getByRole('button', { name: 'Aprovar' }).click();
    await expect(outro.getByText('Versão aprovada.')).toBeVisible();
    await contexto.close();

    await page.reload();
    await expect(
      page.getByRole('row').filter({ hasText: NOME }).getByText('FICTÍCIO: Lei de Teste'),
    ).toBeVisible();
  });
});
