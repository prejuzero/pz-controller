import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/** Agenda pessoal (HU50): baixar o .ics e assinar o feed privado, que a agenda lê sem sessão. */
test('baixa o .ics, assina, a agenda lê o feed e a assinatura é revogada', async ({ page }) => {
  await page.goto('/configuracoes/agenda');
  await expect(page.getByRole('link', { name: 'Baixar .ics' })).toHaveAttribute(
    'href',
    '/v1/agenda/prazos.ics',
  );
  const ics = await page.request.get('/v1/agenda/prazos.ics');
  expect(await ics.text()).toContain('BEGIN:VCALENDAR');

  await page.getByRole('button', { name: /^Gerar/ }).click();
  const endereco = await page.getByLabel('Endereço da assinatura').inputValue();
  expect(endereco).toMatch(/\/v1\/agenda\/feed\//);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);

  // A agenda lê sem a sessão do navegador.
  const caminho = new URL(endereco).pathname;
  const feed = await page.context().request.fetch(caminho, { headers: { cookie: '' } });
  expect(feed.status()).toBe(200);

  await page.getByRole('button', { name: 'Revogar assinatura' }).click();
  await expect(page.getByText('Assinatura revogada.')).toBeVisible();
  expect((await page.context().request.fetch(caminho, { headers: { cookie: '' } })).status()).toBe(
    404,
  );
});
