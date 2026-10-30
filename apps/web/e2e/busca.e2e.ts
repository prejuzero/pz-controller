import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { formatarNumeroCnj } from '@pz/contracts';

/** Busca (HU28, PZ-186): CNJ colado com e sem pontuação; etiquetas removíveis. Dados FICTÍCIOS. */
function numeroFicticio() {
  const partes = {
    sequencial: String((Date.now() + 11) % 10_000_000).padStart(7, '0'),
    ano: '2026',
    segmento: '8',
    tribunal: '26',
    origem: '0100',
  };
  const base = BigInt(
    `${partes.sequencial}${partes.ano}${partes.segmento}${partes.tribunal}${partes.origem}00`,
  );
  const digito = String(98n - (base % 97n)).padStart(2, '0');
  return formatarNumeroCnj({ ...partes, digito });
}

async function semViolacoes(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
}

test('CNJ colado na busca rápida, com e sem pontuação, abre o processo', async ({ page }) => {
  const numero = numeroFicticio();
  await page.goto('/processos');
  await page.getByRole('button', { name: 'Novo processo' }).click();
  await page.getByRole('dialog').getByLabel('Número CNJ').fill(numero);
  await page.getByRole('dialog').getByRole('button', { name: 'Cadastrar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: numero })).toBeVisible();

  for (const colado of [numero, numero.replace(/\D/g, '')]) {
    await page.goto('/');
    const campo = page.getByRole('combobox', { name: 'Buscar processo, parte ou publicação' });
    await campo.fill(colado);
    await expect(page.getByRole('option').first()).toBeVisible();
    await campo.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: numero })).toBeVisible();
  }

  // Atalho "/" leva o foco ao campo.
  await page.goto('/');
  await page.keyboard.press('/');
  await expect(
    page.getByRole('combobox', { name: 'Buscar processo, parte ou publicação' }),
  ).toBeFocused();
});

test('filtros viram etiquetas e remover uma atualiza o resultado', async ({ page }) => {
  await page.goto('/busca?tribunal=TJXX&atalho=hoje');
  await expect(page.getByRole('heading', { level: 1, name: 'Busca' })).toBeVisible();
  await expect(page.getByText('Tribunal: TJXX')).toBeVisible();
  await expect(page.getByText('Nada encontrado com esses filtros.')).toBeVisible();
  await semViolacoes(page);
  await page.getByRole('button', { name: 'Remover Tribunal: TJXX' }).click();
  await expect(page).toHaveURL('/busca?atalho=hoje');
  await expect(page.getByText('Tribunal: TJXX')).toHaveCount(0);
  await page.getByRole('button', { name: 'Publicações' }).click();
  await expect(page).toHaveURL('/busca?recurso=publicacoes&atalho=hoje');
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await expect(page).toHaveURL('/busca?recurso=publicacoes');
});
