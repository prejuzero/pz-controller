import { expect, test } from '@playwright/test';

// Equipe (HU41): a titular convida e cancela; o aceite pelo link é coberto na API.
test('convida um membro e cancela o convite', async ({ page }) => {
  const email = `convidado.${String(Date.now())}@exemplo.invalid`;
  await page.goto('/configuracoes/equipe');
  await expect(page.getByRole('heading', { level: 1, name: 'Equipe' })).toBeVisible();
  await page.getByRole('button', { name: 'Convidar' }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Nome').fill('Convidado Fictício');
  await dialogo.getByLabel('E-mail').fill(email);
  await dialogo.getByRole('button', { name: 'Enviar convite' }).click();
  await expect(page.getByText('Convite enviado.')).toBeVisible();
  const linha = page.getByRole('row', { name: new RegExp(email.replace(/\./g, '\\.')) });
  await expect(linha).toBeVisible();
  await linha.getByRole('button', { name: 'Cancelar convite' }).click();
  await expect(page.getByText('Convite cancelado.')).toBeVisible();
  await expect(linha).toHaveCount(0);
});
