import { readFileSync } from 'node:fs';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Cookie, type Page } from '@playwright/test';
import { COOKIE_SESSAO } from '@pz/contracts';

import { entrar, ESTADO_SESSAO, ROTAS_MENU } from './apoio';

const SEM_SESSAO = { cookies: [], origins: [] };

/** axe sem violações nas regras WCAG 2.1 A e AA (CLAUDE.md, seção 13). */
async function semViolacoes(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}

test.describe('smoke do portal', () => {
  test('navega por todos os itens do menu', async ({ page }) => {
    await page.goto('/');
    const menu = page.getByRole('navigation', { name: 'Menu principal' });
    for (const { href, rotulo } of ROTAS_MENU) {
      await menu.getByRole('link', { name: rotulo }).click();
      await expect(page).toHaveURL(href);
      await expect(page.getByRole('heading', { level: 1, name: rotulo })).toBeVisible();
    }
  });

  test('navegação por teclado: pular para o conteúdo e menu', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Pular para o conteúdo' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#conteudo')).toBeFocused();

    // Do início da página, o Tab alcança o item "Prazos" do menu e o Enter navega.
    await page.goto('/');
    const prazos = page
      .getByRole('navigation', { name: 'Menu principal' })
      .getByRole('link', { name: 'Prazos' });
    const focado = () => prazos.evaluate((el) => el === document.activeElement);
    for (let i = 0; i < 30 && !(await focado()); i++) await page.keyboard.press('Tab');
    await expect(prazos).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL('/prazos');
  });
});

test.describe('acessibilidade (axe)', () => {
  for (const { href } of ROTAS_MENU) {
    test(`sem violações em ${href}`, async ({ page }) => {
      await page.goto(href);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await semViolacoes(page);
    });
  }

  for (const rota of ['/configuracoes/seguranca', '/configuracoes/feriados-locais']) {
    test(`sem violações em ${rota}`, async ({ page }) => {
      await page.goto(rota);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await semViolacoes(page);
    });
  }

  test('sem violações no formulário de feriado local', async ({ page }) => {
    await page.goto('/configuracoes/feriados-locais');
    await page.getByRole('button', { name: 'Novo feriado local' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await semViolacoes(page);
  });

  test.describe('sem sessão', () => {
    test.use({ storageState: SEM_SESSAO });
    for (const rota of ['/entrar', '/recuperar-senha', '/redefinir-senha?token=e2e']) {
      test(`sem violações em ${rota}`, async ({ page }) => {
        await page.goto(rota);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await semViolacoes(page);
      });
    }
  });
});

test.describe('sessão expirada', () => {
  test.use({ storageState: SEM_SESSAO });

  test('redireciona para a entrada e volta à URL original', async ({ page, context }) => {
    // O cookie da sessão real com um token que a API não reconhece: o mesmo efeito de uma sessão
    // expirada no servidor, sem invalidar a sessão compartilhada pelos demais testes.
    const { cookies } = JSON.parse(readFileSync(ESTADO_SESSAO, 'utf8')) as {
      cookies: Cookie[];
    };
    const sessao = cookies.find((c) => c.name === COOKIE_SESSAO);
    if (sessao === undefined) throw new Error('Sessão do setup sem o cookie de sessão');
    await context.addCookies([{ ...sessao, value: 'expirada' }]);
    await page.goto('/prazos?filtro=e2e');
    await expect(page).toHaveURL(
      /\/entrar\?retorno=%2Fprazos%3Ffiltro%3De2e&motivo=sessao-expirada$/,
    );
    await expect(page.getByText('Sua sessão expirou.', { exact: false })).toBeVisible();

    await entrar(page);
    await expect(page).toHaveURL('/prazos?filtro=e2e');
  });
});
