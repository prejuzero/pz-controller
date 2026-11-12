import { expect, test } from '@playwright/test';

/**
 * Jornada do lançamento (HU40, PZ-233): a intimação FICTÍCIA que o seed grava como captura do DJEN
 * (SEED_JORNADA_E2E, só no E2E; o CI nunca acessa a rede) percorre o fluxo real do worker:
 * ingestão (cria o processo), classificação, prazo "a confirmar" e o e-mail de nova intimação com
 * o link de ciência. Aqui: o e-mail chega, a ciência é confirmada pelo link (POST explícito), o
 * prazo mostra a ciência e o histórico, e a busca rápida acha o processo.
 */
const MAILPIT = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';
const NUMERO = '1000123-64.2026.8.26.0100';
const DIGITOS = NUMERO.replace(/\D/g, '');

interface Mensagem {
  readonly ID: string;
  readonly Subject: string;
  readonly Created: string;
}

test('intimação capturada vira prazo, e-mail com ciência, ciência pelo link e histórico', async ({
  page,
  request,
}) => {
  // E-mail e prazo saem pelo worker, depois do seed: espera mais que o padrão.
  test.setTimeout(180_000);
  let texto = '';
  await expect(async () => {
    const lista = (await (
      await request.get(
        `${MAILPIT}/api/v1/search?query=${encodeURIComponent('subject:"Nova intimação"')}`,
      )
    ).json()) as { messages: Mensagem[] };
    const mensagem = lista.messages.find((m) => m.Subject.replace(/\D/g, '').includes(DIGITOS));
    expect(mensagem).toBeDefined();
    const completa = (await (
      await request.get(`${MAILPIT}/api/v1/message/${mensagem?.ID ?? ''}`)
    ).json()) as { Text: string };
    texto = completa.Text;
  }).toPass({ timeout: 150_000, intervals: [2_000] });

  const linkCiencia = /https?:\/\/\S+?(\/ciencia\/[\w.-]+)/.exec(texto)?.[1];
  const linkPrazo = /https?:\/\/\S+?(\/prazos\/[0-9a-f-]{36})/.exec(texto)?.[1];
  expect(linkCiencia, 'link de ciência no e-mail').toBeDefined();
  expect(linkPrazo, 'link do prazo no e-mail').toBeDefined();

  // Ciência pelo link: o GET só mostra; a confirmação é o clique (POST), uma vez só.
  await page.goto(linkCiencia ?? '/');
  await expect(page.getByRole('heading', { name: 'Confirmar ciência' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar ciência' }).click();
  await expect(page.getByText(/Ciência registrada em/)).toBeVisible();

  // No portal: o prazo "a confirmar" da publicação, sem o botão de ciência, e o histórico.
  await page.goto(linkPrazo ?? '/');
  await expect(page.getByText('A confirmar', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar ciência' })).toHaveCount(0);
  const historico = page.getByRole('region', { name: 'Histórico' });
  await expect(historico.getByText('Prazo sugerido', { exact: true }).first()).toBeVisible();

  // Busca rápida pelo número: abre o processo criado pela ingestão.
  await page.goto('/');
  const campo = page.getByRole('combobox', { name: 'Buscar processo, parte ou publicação' });
  await campo.fill(NUMERO);
  await expect(page.getByRole('option').first()).toBeVisible();
  await campo.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: NUMERO })).toBeVisible();
});
