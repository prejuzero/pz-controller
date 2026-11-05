import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { formatarNumeroCnj } from '@pz/contracts';

/**
 * Conferência de painel (HU36, PZ-217): processo fora da cobertura entra na lista; "conferido,
 * sem novidade" em um clique; "encontrei intimação" registra e abre o cadastro do prazo no
 * processo. Números FICTÍCIOS.
 */
function numeroFicticio(): string {
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

test('processo fora da cobertura: conferir sem novidade e encontrar intimação', async ({
  page,
}) => {
  const numero = numeroFicticio();
  await page.goto('/processos');
  // Atalho para as conferências na tela de Processos (PZ-355).
  await expect(page.getByRole('link', { name: 'Conferências de painel' })).toHaveAttribute(
    'href',
    '/conferencias',
  );
  await page.getByRole('button', { name: 'Novo processo' }).click();
  await page.getByRole('dialog').getByLabel('Número CNJ').fill(numero);
  await page.getByRole('dialog').getByRole('button', { name: 'Cadastrar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: numero })).toBeVisible();

  await page.getByRole('button', { name: 'Marcar como fora da cobertura' }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Motivo').fill('Intimações só no painel do tribunal (FICTÍCIO).');
  await expect(dialogo.getByText('Conferir o painel a cada')).toBeVisible();
  await dialogo.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Conferência do painel a cada 5 dias.')).toBeVisible();

  await page.getByRole('link', { name: 'Ver conferências' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Conferências de painel' }),
  ).toBeVisible();
  await expect(page.getByText('O que o PrejuZero monitora sozinho')).toBeVisible();
  const linha = page.getByRole('row').filter({ hasText: numero });
  await expect(linha).toContainText('Nenhuma ainda');
  await linha.getByRole('button', { name: 'Conferido, sem novidade' }).click();
  await expect(page.getByText('Conferência registrada.')).toBeVisible();
  await expect(linha).toContainText('sem novidade');

  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations.map((v) => v.id)).toEqual([]);

  await linha.getByRole('button', { name: 'Encontrei intimação' }).click();
  await expect(page).toHaveURL(/\/processos\/[0-9a-f-]+\?novoPrazo=1$/);
  await expect(page.getByRole('dialog', { name: 'Novo prazo' })).toBeVisible();

  // Registro direto no detalhe do processo (PZ-355).
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Conferido, sem novidade' }).click();
  await expect(page.getByText('Conferência registrada.')).toBeVisible();
});
