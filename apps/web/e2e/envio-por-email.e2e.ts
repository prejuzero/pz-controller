import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Envio manual por e-mail (HU32, PZ-202): destinatário de fora do escritório só recebe depois da
 * confirmação de sigilo; o e-mail chega com o anexo gerado pelo pipeline de relatórios. Dados do
 * seed (FICTÍCIOS); e-mail reservado .invalid na caixa de teste (Mailpit).
 */
const MAILPIT = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';

test('envia a busca para fora do escritório só com a confirmação de sigilo', async ({
  page,
  request,
}) => {
  // Anexo e e-mail saem pelo worker: espera mais que o padrão de 30 s.
  test.setTimeout(120_000);
  const destino = `envio-${String(Date.now())}@fora.invalid`;
  await page.goto('/busca?tribunal=TJGO');
  await page.getByRole('button', { name: 'Enviar por e-mail' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Enviar por e-mail' });
  await dialogo.getByLabel(/^Destinatários/).fill(destino);
  await dialogo.getByLabel('Mensagem (opcional)').fill('Segue a busca.');
  await expect(dialogo.getByText('Anexo: prejuzero-busca.pdf')).toBeVisible();
  await dialogo.getByRole('button', { name: 'Enviar', exact: true }).click();

  // Fora do escritório: aviso de sigilo e confirmação explícita antes de sair.
  await expect(dialogo.getByText('Destinatário de fora do escritório')).toBeVisible();
  const confirmar = dialogo.getByRole('button', { name: 'Confirmar e enviar' });
  await expect(confirmar).toBeDisabled();
  const { violations } = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  await dialogo
    .getByLabel('Confirmo que posso enviar estes dados para fora do escritório.')
    .check();
  await confirmar.click();
  await expect(page.getByText('Envio solicitado')).toBeVisible();

  await expect(async () => {
    const lista = (await (
      await request.get(`${MAILPIT}/api/v1/search?query=to:${destino}`)
    ).json()) as { messages: { ID: string; Subject: string }[] };
    const [mensagem] = lista.messages;
    expect(mensagem?.Subject).toContain('enviou o resultado de uma busca pelo PrejuZero');
    const completa = (await (
      await request.get(`${MAILPIT}/api/v1/message/${mensagem?.ID ?? ''}`)
    ).json()) as { Text: string; Attachments: { FileName: string }[] };
    expect(completa.Text).toContain('Segue a busca.');
    expect(completa.Attachments.map((a) => a.FileName)).toEqual(['prejuzero-busca.pdf']);
  }).toPass({ timeout: 90_000 });

  // Situação do envio no portal (PZ-361): quem enviou vê que chegou.
  await page.goto('/envios');
  await expect(page.getByRole('heading', { level: 1, name: 'Envios por e-mail' })).toBeVisible();
  const linha = page.getByRole('row').filter({ hasText: 'Resultado da busca' }).first();
  await expect(async () => {
    await page.reload();
    await expect(linha).toContainText('Enviado', { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
});
