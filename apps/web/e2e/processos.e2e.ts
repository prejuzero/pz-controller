import { expect, test } from '@playwright/test';
import { formatarNumeroCnj } from '@pz/contracts';

/**
 * Número CNJ FICTÍCIO e único por execução (o banco local persiste entre rodadas), com o dígito
 * calculado como na Resolução CNJ 65/2008: 98 − (base·100 mod 97).
 */
function numeroFicticio(): string {
  const partes = {
    sequencial: String(Date.now() % 10_000_000).padStart(7, '0'),
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

test('cadastra processo, marca sigilo e vê o selo na lista e no detalhe', async ({ page }) => {
  const numero = numeroFicticio();
  await page.goto('/processos');

  await page.getByRole('button', { name: 'Novo processo' }).click();
  const formulario = page.getByRole('dialog');
  await formulario
    .getByLabel('Número CNJ')
    .fill(`Intimação no processo ${numero} para manifestação`);
  await expect(formulario.getByText(/Número válido · TJSP/)).toBeVisible();
  await formulario.getByRole('button', { name: 'Cadastrar' }).click();
  await expect(page.getByText('Processo cadastrado.')).toBeVisible();

  // O cadastro abre o detalhe do processo, ainda sem o selo.
  await expect(page.getByRole('heading', { level: 1, name: numero })).toBeVisible();
  await expect(page.getByText('Sigiloso', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Editar dados' }).click();
  const edicao = page.getByRole('dialog');
  await edicao.getByLabel('Sigiloso').check();
  await edicao.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Dados do processo salvos.')).toBeVisible();
  await expect(page.getByText('Sigiloso', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Voltar para processos' }).click();
  await expect(
    page.getByRole('row').filter({ hasText: numero }).getByText('Sigiloso', { exact: true }),
  ).toBeVisible();
});
