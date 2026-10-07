import { createHmac } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { expect, type Page } from '@playwright/test';

// Usuário fictício do seed local (packages/db/prisma/seed.ts); o scripts/e2e.sh zera o 2FA dele.
export const EMAIL = 'demonstracao@prejuzero.local';
export const SENHA = process.env.SENHA_DEMONSTRACAO ?? 'demonstracao local 2026';

export const ESTADO_SESSAO = 'e2e/.sessao/estado.json';
/** Segredo e último passo TOTP por usuário: cada um ativa o próprio 2FA no primeiro acesso. */
const arquivoTotp = (email: string) => `e2e/.sessao/totp-${email}.json`;

// Curadores FICTÍCIOS do seed (tenant plataforma), para a aprovação por quatro olhos.
export const CURADOR_1 = 'curadoria1@prejuzero.local';
export const CURADOR_2 = 'curadoria2@prejuzero.local';
export const ESTADO_CURADOR = 'e2e/.sessao/estado-curador.json';
const PERIODO_S = 30;

/** Rotas do menu (src/navegacao.ts) com o rótulo do catálogo pt-BR. */
export const ROTAS_MENU = [
  { href: '/', rotulo: 'Dashboard' },
  { href: '/prazos', rotulo: 'Prazos' },
  { href: '/publicacoes', rotulo: 'Publicações' },
  { href: '/busca', rotulo: 'Busca' },
  { href: '/processos', rotulo: 'Processos' },
  { href: '/calendario', rotulo: 'Calendário' },
  { href: '/relatorios', rotulo: 'Relatórios' },
  { href: '/configuracoes', rotulo: 'Configurações' },
] as const;

function base32(texto: string): Buffer {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of texto.replace(/[\s=]/g, '').toUpperCase()) {
    const valor = alfabeto.indexOf(c);
    if (valor < 0) throw new Error(`Segredo TOTP inválido: ${c}`);
    bits += valor.toString(2).padStart(5, '0');
  }
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((b) => parseInt(b, 2)));
}

/** RFC 6238 (HMAC-SHA1, 6 dígitos, passo de 30 s), como o autenticador do celular. */
export function codigoTotp(segredo: string, passo: number): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(passo));
  const hmac = createHmac('sha1', base32(segredo)).update(contador).digest();
  const deslocamento = (hmac[hmac.length - 1] ?? 0) & 0xf;
  const numero = hmac.readUInt32BE(deslocamento) & 0x7fffffff;
  return String(numero % 1_000_000).padStart(6, '0');
}

interface EstadoTotp {
  segredo: string;
  ultimoPasso: number;
}

function lerTotp(email: string): EstadoTotp {
  return JSON.parse(readFileSync(arquivoTotp(email), 'utf8')) as EstadoTotp;
}

function salvarTotp(email: string, estado: EstadoTotp): void {
  mkdirSync('e2e/.sessao', { recursive: true });
  writeFileSync(arquivoTotp(email), JSON.stringify(estado));
}

/**
 * Próximo código aceito: a API recusa passo já usado e aceita até um passo à frente
 * (modules/identidade/application/segundo-fator.ts). Espera o passo virar se preciso.
 */
async function proximoCodigo(
  page: Page,
  email: string,
  segredo: string,
  ultimoPasso: number,
): Promise<string> {
  let atual = Math.floor(Date.now() / 1000 / PERIODO_S);
  while (ultimoPasso >= atual + 1) {
    await page.waitForTimeout(1_000);
    atual = Math.floor(Date.now() / 1000 / PERIODO_S);
  }
  const passo = Math.max(atual, ultimoPasso + 1);
  salvarTotp(email, { segredo, ultimoPasso: passo });
  return codigoTotp(segredo, passo);
}

/** Senha → 2FA (ativa no primeiro acesso, verifica nos seguintes) → destino. */
export async function entrar(page: Page, senha = SENHA, email = EMAIL): Promise<void> {
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel(/^Senha/).fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/\/entrar\/2fa/);

  const ativar = page.getByRole('button', { name: 'Ativar' });
  const verificar = page.getByRole('button', { name: 'Verificar' });
  await expect(ativar.or(verificar)).toBeVisible();

  if (await ativar.isVisible()) {
    const segredo = (
      await page.getByText('Sem câmera?').locator('xpath=following-sibling::p[1]').innerText()
    ).trim();
    await page.getByLabel('Código').fill(await proximoCodigo(page, email, segredo, 0));
    await ativar.click();
    await page.getByRole('button', { name: 'Já guardei, continuar' }).click();
  } else {
    const { segredo, ultimoPasso } = lerTotp(email);
    await page.getByLabel('Código').fill(await proximoCodigo(page, email, segredo, ultimoPasso));
    await verificar.click();
  }
  await page.waitForURL((url) => !url.pathname.startsWith('/entrar'));
}
