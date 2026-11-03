import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { formatarNumeroCnj } from '@pz/contracts';

import { entrar } from './apoio';

/**
 * Ciência em lote e alerta ao entrar (HU34, PZ-210). Roda depois de tabela-prazos.e2e.ts (ordem
 * alfabética, um worker): usa o tipo de ato FICTÍCIO da curadoria. Datas e números FICTÍCIOS.
 */
function numeroFicticio(): string {
  const partes = {
    sequencial: String((Date.now() + 13) % 10_000_000).padStart(7, '0'),
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

async function novoPrazo(page: Page, dias: string) {
  await page.getByRole('button', { name: 'Novo prazo' }).click();
  const novo = page.getByRole('dialog');
  await novo.getByRole('combobox', { name: 'Tipo de ato' }).click();
  await page.getByRole('option').first().click();
  await novo.getByLabel('Data de referência').fill('2026-10-05');
  await novo.getByLabel('Dias fixados no ato (se houver)').fill(dias);
  await novo.getByRole('button', { name: 'Calcular' }).click();
  await expect(novo.getByText(/Vencimento calculado:/)).toBeVisible();
  await novo.getByRole('button', { name: 'Salvar prazo' }).click();
  await expect(page.getByText('Prazo cadastrado.')).toBeVisible();
}

test('alerta ao entrar e confirmação de ciência em lote', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const numero = numeroFicticio();
  await page.goto('/processos');
  await page.getByRole('button', { name: 'Novo processo' }).click();
  await page.getByRole('dialog').getByLabel('Número CNJ').fill(numero);
  await page.getByRole('dialog').getByRole('button', { name: 'Cadastrar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: numero })).toBeVisible();
  const processo = page.url();
  await novoPrazo(page, '15');
  await page.goto(processo);
  await expect(page.getByRole('heading', { level: 1, name: numero })).toBeVisible();
  await novoPrazo(page, '10');

  // Entrada nova: o alerta lista os prazos sem ciência; a faixa continua enquanto houver.
  const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const outra = await contexto.newPage();
  await outra.goto('/entrar');
  await entrar(outra);
  const alerta = outra.getByRole('dialog', { name: 'Prazos aguardando ciência' });
  await expect(alerta).toBeVisible();
  const { violations } = await new AxeBuilder({ page: outra })
    .include('[role="dialog"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  await outra.keyboard.press('Escape');
  await expect(alerta).toBeHidden();
  await expect(outra.getByText(/aguardam? confirmação de ciência/)).toBeVisible();
  // Navegar não abre o alerta de novo: ele é da entrada.
  await outra.goto('/prazos');
  await expect(outra.getByRole('dialog', { name: 'Prazos aguardando ciência' })).toHaveCount(0);
  await contexto.close();

  // Lote pela busca: os dois prazos do processo, cada um com o próprio registro.
  await page.goto(`/busca?numeroCnj=${encodeURIComponent(numero)}`);
  await page.getByRole('checkbox', { name: 'Marcar todos sem ciência' }).check();
  await expect(page.getByText('2 prazos marcados')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar ciência (2)' }).click();
  await expect(page.getByText('Ciência registrada em 2 prazos.')).toBeVisible();
  // O prazo espelha a ciência pelo evento CienciaConfirmada (worker, HU33): chega em instantes.
  await expect(async () => {
    await page.reload();
    await expect(
      page.getByRole('table', { name: 'Prazos' }).getByRole('cell', { name: 'Confirmada' }),
    ).toHaveCount(2, { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
});
