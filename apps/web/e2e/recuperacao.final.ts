import { expect, test } from '@playwright/test';

import { EMAIL, entrar } from './apoio';

// Roda depois dos demais (projeto "recuperacao" no playwright.config.ts): a troca de senha pode
// encerrar as sessões abertas. O scripts/e2e.sh devolve a senha do seed a cada execução.
const MAILPIT = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';
const NOVA_SENHA = 'frase longa e única do teste ponta a ponta 2026';

test.use({ storageState: { cookies: [], origins: [] } });

test('recupera a senha pelo link do e-mail e entra com a nova senha', async ({ page, request }) => {
  await request.delete(`${MAILPIT}/api/v1/messages`);

  await page.goto('/entrar');
  await page.getByRole('link', { name: 'Esqueci minha senha' }).click();
  // A /entrar também tem "E-mail": sem esperar a navegação, o fill cai no formulário antigo.
  await expect(page.getByRole('heading', { level: 1, name: 'Recuperar senha' })).toBeVisible();
  await page.getByLabel('E-mail').fill(EMAIL);
  await page.getByRole('button', { name: 'Enviar link' }).click();
  await expect(page.getByText('Se o e-mail estiver cadastrado', { exact: false })).toBeVisible();

  // O e-mail sai pelo worker (outbox → fila → SMTP do Mailpit): aguarda a chegada.
  let token = '';
  await expect(async () => {
    const lista = (await (
      await request.get(`${MAILPIT}/api/v1/search?query=to:${EMAIL}`)
    ).json()) as {
      messages: { ID: string }[];
    };
    const id = lista.messages[0]?.ID;
    expect(id).toBeDefined();
    const mensagem = (await (
      await request.get(`${MAILPIT}/api/v1/message/${id ?? ''}`)
    ).json()) as {
      Text: string;
    };
    token = /redefinir-senha#token=([\w-]+)/.exec(mensagem.Text)?.[1] ?? '';
    expect(token).not.toBe('');
  }).toPass({ timeout: 30_000 });

  await page.goto(`/redefinir-senha#token=${token}`);
  await page.getByLabel(/^Nova senha/).fill(NOVA_SENHA);
  await page.getByLabel(/^Confirme a nova senha/).fill(NOVA_SENHA);
  await page.getByRole('button', { name: 'Salvar nova senha' }).click();
  await expect(page).toHaveURL(/\/entrar\?motivo=senha-redefinida$/);

  await entrar(page, NOVA_SENHA);
  await expect(page).toHaveURL('/');
});
