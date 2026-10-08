import { expect, test as setup } from '@playwright/test';

import {
  ADMIN,
  CURADOR_1,
  entrar,
  ESTADO_ADMIN,
  ESTADO_CURADOR,
  ESTADO_SESSAO,
  SENHA,
} from './apoio';

// Smoke do acesso (HU06): login com ativação do 2FA obrigatório; a sessão serve aos demais testes.
setup('entra com senha e ativa o 2FA', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/entrar$/);
  await entrar(page);
  await expect(page).toHaveURL('/');
  await page.context().storageState({ path: ESTADO_SESSAO });
});

// Curadoria (HU15): sessão do primeiro curador fictício, no tenant plataforma.
setup('curador entra e ativa o 2FA', async ({ browser }) => {
  const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await contexto.newPage();
  await page.goto('/entrar');
  await entrar(page, SENHA, CURADOR_1);
  await contexto.storageState({ path: ESTADO_CURADOR });
  await contexto.close();
});

// Administração da plataforma (HU39): sessão do administrador fictício.
setup('administrador entra e ativa o 2FA', async ({ browser }) => {
  const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await contexto.newPage();
  await page.goto('/entrar');
  await entrar(page, SENHA, ADMIN);
  await contexto.storageState({ path: ESTADO_ADMIN });
  await contexto.close();
});
