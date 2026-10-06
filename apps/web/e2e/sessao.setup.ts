import { expect, test as setup } from '@playwright/test';

import { entrar, ESTADO_SESSAO } from './apoio';

// Smoke do acesso (HU06): login com ativação do 2FA obrigatório; a sessão serve aos demais testes.
setup('entra com senha e ativa o 2FA', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/entrar$/);
  await entrar(page);
  await expect(page).toHaveURL('/');
  await page.context().storageState({ path: ESTADO_SESSAO });
});
