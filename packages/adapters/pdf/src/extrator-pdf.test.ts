import { ErroPermanente } from '@pz/integracoes';
import { describe, expect, it } from 'vitest';

import { ehPdf, ExtratorPdf } from './extrator-pdf.js';

/** PDF mínimo FICTÍCIO de uma página; `texto` vazio gera página sem camada de texto. */
function pdf(texto: string): Uint8Array {
  const conteudo = texto === '' ? '' : `BT /F1 12 Tf 72 720 Td (${texto}) Tj ET`;
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
  return new TextEncoder().encode(corpo);
}

describe('ExtratorPdf (HU25, ADR-019)', () => {
  const extrator = new ExtratorPdf();

  it('lê a camada de texto do PDF', async () => {
    const r = await extrator.extrairDePdf(pdf('Cite-se a parte FICTICIA no prazo de 15 dias'));
    expect(r.paginas).toBe(1);
    expect(r.texto).toContain('Cite-se a parte FICTICIA no prazo de 15 dias');
  });

  it('PDF sem texto (como o escaneado) devolve texto vazio', async () => {
    expect(await extrator.extrairDePdf(pdf(''))).toEqual({ texto: '', paginas: 1 });
  });

  it('recusa o que não é PDF e o PDF corrompido, sem nova tentativa', async () => {
    expect(ehPdf(new TextEncoder().encode('%PDF-1.7'))).toBe(true);
    expect(ehPdf(new TextEncoder().encode('<html>'))).toBe(false);
    await expect(extrator.extrairDePdf(new TextEncoder().encode('<html>'))).rejects.toThrow(
      ErroPermanente,
    );
    await expect(
      extrator.extrairDePdf(new TextEncoder().encode('%PDF-1.4\nquebrado')),
    ).rejects.toThrow('não foi possível ler o PDF');
  });
});
