import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { formatarNumeroCnj } from '@pz/contracts';

/**
 * Ciclo de vida do prazo pelo portal (HU24, PZ-171; HU25): cadastro manual com prévia do motor →
 * confirmar → ajustar com motivo → cumprir. Roda depois de tabela-prazos.e2e.ts (ordem alfabética,
 * um worker): usa um tipo de ato FICTÍCIO que a curadoria cadastrou. Datas e números FICTÍCIOS.
 */
function numeroFicticio(): string {
  const partes = {
    sequencial: String((Date.now() + 7) % 10_000_000).padStart(7, '0'),
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

test('cadastra, confirma, ajusta e cumpre um prazo', async ({ page }) => {
  const numero = numeroFicticio();
  await page.goto('/processos');
  await page.getByRole('button', { name: 'Novo processo' }).click();
  await page.getByRole('dialog').getByLabel('Número CNJ').fill(numero);
  await page.getByRole('dialog').getByRole('button', { name: 'Cadastrar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: numero })).toBeVisible();

  await page.getByRole('button', { name: 'Novo prazo' }).click();
  const novo = page.getByRole('dialog');
  await novo.getByRole('combobox', { name: 'Tipo de ato' }).click();
  await page.getByRole('option').first().click();
  await novo.getByLabel('Data de referência').fill('2026-10-05');
  await novo.getByLabel('Dias fixados no ato (se houver)').fill('15');
  await novo.getByRole('button', { name: 'Calcular' }).click();
  await expect(novo.getByText(/Vencimento calculado:/)).toBeVisible();
  await semViolacoes(page);
  await novo.getByRole('button', { name: 'Salvar prazo' }).click();
  await expect(page.getByText('Prazo cadastrado.')).toBeVisible();

  // Sem marcar "Confirmo esta data", nasce "a confirmar"; a confirmação é um passo do advogado.
  await expect(page.getByText('A confirmar', { exact: true })).toBeVisible();
  await semViolacoes(page);
  await page.getByRole('button', { name: 'Confirmar prazo' }).click();
  await expect(page.getByText('Prazo confirmado.')).toBeVisible();

  await page.getByRole('button', { name: 'Ajustar' }).click();
  const ajuste = page.getByRole('dialog');
  await ajuste.getByLabel('Motivo').fill('o despacho fixou dez dias');
  await ajuste.getByLabel('Dias').fill('10');
  await ajuste.getByRole('button', { name: 'Ver prévia' }).click();
  await expect(ajuste.getByText(/Novo vencimento:/)).toBeVisible();
  await ajuste.getByRole('button', { name: 'Salvar ajuste' }).click();
  await expect(page.getByText('Prazo ajustado.')).toBeVisible();
  await expect(page.getByText('o despacho fixou dez dias')).toBeVisible();

  await page.getByRole('button', { name: 'Marcar como cumprido' }).click();
  await expect(page.getByText('Prazo marcado como cumprido.')).toBeVisible();
  await expect(page.getByText('Cumpridos', { exact: true })).toBeVisible();
});
