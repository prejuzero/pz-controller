import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { formatarNumeroCnj } from '@pz/contracts';

/**
 * HU42 pelo portal: importação de processos por planilha, nomes monitorados e conferência das
 * publicações capturadas só pelo nome (o seed local deixa duas pendentes a cada execução). Dados
 * FICTÍCIOS; números únicos por execução (o banco local persiste entre rodadas).
 */
function numeroFicticio(deslocamento: number): string {
  const partes = {
    sequencial: String((Date.now() + deslocamento) % 10_000_000).padStart(7, '0'),
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

test('importa processos por planilha: prévia, importação em segundo plano e lista', async ({
  page,
}) => {
  const [a, b] = [numeroFicticio(11), numeroFicticio(13)];
  await page.goto('/processos');
  await page.getByRole('button', { name: 'Importar planilha' }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Conteúdo do CSV').fill(`numeroCnj;comarca\n${a};São Paulo\n${b};`);
  await dialogo.getByRole('button', { name: 'Validar' }).click();
  await expect(dialogo.getByText(/2 processos novos/)).toBeVisible();
  await semViolacoes(page);
  await dialogo.getByRole('button', { name: 'Importar 2 processos' }).click();
  await expect(dialogo.getByText(/2 processos cadastrados/)).toBeVisible({ timeout: 30_000 });
  // O X do diálogo também se chama "Fechar": o botão do rodapé é o que tem o texto.
  await dialogo.getByText('Fechar', { exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: a })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: b })).toBeVisible();
});

test('monitora e deixa de monitorar um nome do escritório', async ({ page }) => {
  const nome = `Sociedade Fictícia E2E ${String(Date.now())}`;
  await page.goto('/configuracoes/nomes-monitorados');
  await page.getByLabel('Nome').fill(nome);
  await page.getByRole('button', { name: 'Monitorar nome' }).click();
  await expect(page.getByText('Nome incluído no monitoramento.')).toBeVisible();
  const item = page.getByRole('listitem').filter({ hasText: nome });
  await expect(item).toBeVisible();
  await semViolacoes(page);
  await item.getByRole('button', { name: 'Remover' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remover' }).click();
  await expect(page.getByText('Nome removido do monitoramento.')).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: nome })).toHaveCount(0);
});

test('confere as publicações capturadas pelo nome: confirma uma e descarta a outra', async ({
  page,
}) => {
  await page.goto('/publicacoes?conferir=true');
  const linhas = page.getByRole('row').filter({ hasText: 'Conferir' });
  await expect(linhas).toHaveCount(2);

  await page.getByRole('row').filter({ hasText: '10000058820268260100' }).getByRole('link').click();
  await expect(page.getByRole('heading', { name: /confira/ })).toBeVisible();
  await semViolacoes(page);
  await page.getByRole('button', { name: 'É do escritório', exact: true }).click();
  await expect(page.getByText(/Publicação confirmada/)).toBeVisible();
  // Confirmada, ganha o processo e o aviso some.
  await expect(page.getByRole('heading', { name: /confira/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '10000058820268260100' })).toBeVisible();

  await page.goto('/publicacoes?conferir=true');
  await page.getByRole('row').filter({ hasText: '10000067320268260100' }).getByRole('link').click();
  await page.getByRole('button', { name: 'Não é do escritório' }).click();
  await expect(page).toHaveURL(/\/publicacoes$/);
  await expect(page.getByRole('row').filter({ hasText: '10000067320268260100' })).toHaveCount(0);
});
