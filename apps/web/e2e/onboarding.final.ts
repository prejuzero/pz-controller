import { expect, test } from '@playwright/test';

import { codigoTotp } from './apoio';

// Onboarding completo (HU11, PZ-123): dados → 2 OABs → conta → 2FA, abaixo de 3 minutos.
// Dados FICTÍCIOS e únicos por execução (o banco local persiste entre execuções).
function cpfFicticio(): string {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (d: number[]) =>
    ((d.reduce((t, x, i) => t + x * (d.length + 1 - i), 0) * 10) % 11) % 10;
  const primeiro = dv(base);
  return [...base, primeiro, dv([...base, primeiro])].join('');
}

test.use({ storageState: { cookies: [], origins: [] } });

test('onboarding com 2 OABs em menos de 3 minutos', async ({ page }) => {
  const inicio = Date.now();
  const sufixo = String(inicio).slice(-6);
  await page.goto('/entrar');
  await page.getByRole('link', { name: 'Ainda não tem conta? Cadastre-se' }).click();

  await page.getByLabel(/^Nome completo/).fill('Pessoa Fictícia de Teste');
  await page.getByLabel(/^CPF/).fill(cpfFicticio());
  await page.getByLabel(/^E-mail/).fill(`onboarding-${sufixo}@exemplo.invalid`);
  await page.getByLabel(/^Celular/).fill('11987654321');
  await page.getByLabel(/^Senha/).fill('frase longa do onboarding ponta a ponta');
  await page.getByLabel(/^Confirme a senha/).fill('frase longa do onboarding ponta a ponta');
  await page.getByRole('button', { name: 'Continuar' }).click();

  const escolherUf = async (indice: number, uf: string) => {
    await page.getByRole('combobox', { name: /^UF/ }).nth(indice).click();
    await page.getByRole('option', { name: uf, exact: true }).click();
  };
  await page
    .getByLabel(/^Número/)
    .first()
    .fill(`7${sufixo}`.slice(0, 6));
  await escolherUf(0, 'SP');
  await page.getByRole('button', { name: 'Adicionar OAB suplementar' }).click();
  await page
    .getByLabel(/^Número/)
    .nth(1)
    .fill(`8${sufixo}`.slice(0, 6));
  await escolherUf(1, 'RJ');
  await page.getByRole('button', { name: 'Continuar' }).click();

  await page.getByRole('button', { name: 'Criar conta e configurar o 2FA' }).click();
  await page.waitForURL(/\/entrar\/2fa/);
  const segredo = (
    await page.getByText('Sem câmera?').locator('xpath=following-sibling::p[1]').innerText()
  ).trim();
  await page.getByLabel('Código').fill(codigoTotp(segredo, Math.floor(Date.now() / 30_000)));
  await page.getByRole('button', { name: 'Ativar' }).click();
  await page.getByRole('button', { name: 'Já guardei, continuar' }).click();
  await expect(page).toHaveURL('/');

  expect(Date.now() - inicio).toBeLessThan(3 * 60_000);
  await page.goto('/configuracoes/oabs');
  await expect(page.getByText(`/SP`)).toBeVisible();
  await expect(page.getByText(`/RJ`)).toBeVisible();
});
