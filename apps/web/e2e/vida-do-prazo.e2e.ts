import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { formatarNumeroCnj } from '@pz/contracts';

/**
 * Ciclo de vida do prazo pelo portal (HU24, PZ-171; HU25): cadastro manual com prévia do motor →
 * confirmar → ajustar com motivo → cumprir. Roda depois de tabela-prazos.e2e.ts (ordem alfabética,
 * um worker): usa um tipo de ato FICTÍCIO que a curadoria cadastrou. Datas e números FICTÍCIOS.
 */
function numeroFicticio(): string {
  const partes = {
    sequencial: String((Date.now() + 7) % 10_000_000).padStart(7, '0'),
    ano: '2026',
    segmento: '8',
    tribunal: '26',
    origem: '0100',
  };
  const base = BigInt(
    `${partes.sequencial}${partes.ano}${partes.segmento}${partes.tribunal}${partes.origem}00`,
  );
  const digito = String(98n - (base % 97n)).padStart(2, '0');
  return formatarNumeroCnj({ ...partes, digito });
}

/** PDF mínimo FICTÍCIO de uma página, com camada de texto. */
function pdfFicticio(texto: string): Buffer {
  const conteudo = `BT /F1 12 Tf 72 720 Td (${texto}) Tj ET`;
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${String(conteudo.length)} >>\nstream\n${conteudo}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let corpo = '%PDF-1.4\n';
  const posicoes: number[] = [];
  objetos.forEach((objeto, i) => {
    posicoes.push(corpo.length);
    corpo += `${String(i + 1)} 0 obj\n${objeto}\nendobj\n`;
  });
  const xref = corpo.length;
  corpo += `xref\n0 ${String(objetos.length + 1)}\n0000000000 65535 f \n`;
  corpo += posicoes.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('');
  corpo += `trailer\n<< /Size ${String(objetos.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`;
  return Buffer.from(corpo, 'latin1');
}

async function semViolacoes(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
}

test('cadastra, confirma, ajusta e cumpre um prazo', async ({ page }) => {
  const numero = numeroFicticio();
  await page.goto('/processos');
  await page.getByRole('button', { name: 'Novo processo' }).click();
  await page.getByRole('dialog').getByLabel('Número CNJ').fill(numero);
  await page.getByRole('dialog').getByRole('button', { name: 'Cadastrar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: numero })).toBeVisible();

  await page.getByRole('button', { name: 'Novo prazo' }).click();
  const novo = page.getByRole('dialog');
  // Cadastro assistido: sugere (ou avisa que não conseguiu) sem gravar nada.
  await novo
    .getByLabel('Colar o texto da intimação (opcional)')
    .fill('Intime-se a parte para se manifestar no prazo de 15 (quinze) dias. (FICTÍCIO)');
  await novo.getByRole('button', { name: 'Analisar texto' }).click();
  await expect(novo.getByText(/Sugestão:|Não foi possível sugerir/)).toBeVisible();
  // PDF FICTÍCIO com camada de texto: guardado no armazenamento e vinculado ao prazo.
  await novo.getByLabel('Ou enviar o PDF da intimação (até 10 MB)').setInputFiles({
    name: 'intimacao-ficticia.pdf',
    mimeType: 'application/pdf',
    buffer: pdfFicticio('Intime-se a parte para se manifestar no prazo de 15 dias'),
  });
  await expect(novo.getByText(/PDF analisado \(1 páginas\)/)).toBeVisible();
  await novo.getByRole('combobox', { name: 'Tipo de ato' }).click();
  await page.getByRole('option').first().click();
  await novo.getByLabel('Data de referência').fill('2026-10-05');
  await novo.getByLabel('Dias fixados no ato (se houver)').fill('15');
  await novo.getByRole('button', { name: 'Calcular' }).click();
  await expect(novo.getByText(/Vencimento calculado:/)).toBeVisible();
  await semViolacoes(page);
  await novo.getByRole('button', { name: 'Salvar prazo' }).click();
  await expect(page.getByText('Prazo cadastrado.')).toBeVisible();

  await expect(page.getByRole('button', { name: 'Abrir o PDF de origem' })).toBeVisible();
  // Sem marcar "Confirmo esta data", nasce "a confirmar"; a confirmação é um passo do advogado.
  await expect(page.getByText('A confirmar', { exact: true })).toBeVisible();
  await semViolacoes(page);
  await page.getByRole('button', { name: 'Confirmar prazo' }).click();
  await expect(page.getByText('Prazo confirmado.')).toBeVisible();

  await page.getByRole('button', { name: 'Ajustar' }).click();
  const ajuste = page.getByRole('dialog');
  await ajuste.getByLabel('Motivo').fill('o despacho fixou dez dias');
  await ajuste.getByLabel('Dias').fill('10');
  await ajuste.getByRole('button', { name: 'Ver prévia' }).click();
  await expect(ajuste.getByText(/Novo vencimento:/)).toBeVisible();
  await ajuste.getByRole('button', { name: 'Salvar ajuste' }).click();
  await expect(page.getByText('Prazo ajustado.')).toBeVisible();
  await expect(page.getByText('o despacho fixou dez dias')).toBeVisible();

  await page.getByRole('button', { name: 'Marcar como cumprido' }).click();
  await expect(page.getByText('Prazo marcado como cumprido.')).toBeVisible();
  await expect(page.getByText('Cumpridos', { exact: true })).toBeVisible();
});

test('agenda e cancela um compromisso', async ({ page }) => {
  const titulo = `Audiência FICTÍCIA ${String(Date.now())}`;
  await page.goto('/prazos');
  await page.getByRole('button', { name: 'Novo compromisso' }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Título').fill(titulo);
  // Daqui a alguns dias, dentro da janela de 30 dias da lista.
  const data = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  await dialogo.getByLabel('Data').fill(data);
  await dialogo.getByLabel('Hora (Brasília)').fill('14:00');
  await semViolacoes(page);
  await dialogo.getByRole('button', { name: 'Agendar' }).click();
  await expect(page.getByText('Compromisso agendado.')).toBeVisible();
  const item = page.getByRole('listitem').filter({ hasText: titulo });
  await expect(item).toBeVisible();
  await item.getByRole('button', { name: 'Cancelar' }).click();
  await page.getByRole('dialog').getByLabel('Motivo do cancelamento').fill('audiência redesignada');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByText('Compromisso cancelado.')).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: titulo })).toHaveCount(0);
});
