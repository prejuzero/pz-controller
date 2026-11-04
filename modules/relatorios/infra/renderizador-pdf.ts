import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

import type { Renderizador } from '../application/portas.js';
import type { Coluna, Documento } from '../domain/relatorio.js';

const MARGEM = 36;
const CORPO = 8;
const RODAPE = 24;

/**
 * PDF (HU29) com pdfkit: A4 paisagem, cabeçalho com título, data e hora, usuário e filtro (RF61),
 * tabela com quebra de página (repete os títulos das colunas) e rodapé "Página X de Y". Fontes
 * padrão do PDF (WinAnsi): cobrem os acentos do português sem embutir fonte.
 */
export class RenderizadorPdf implements Renderizador {
  readonly formato = 'pdf' as const;
  readonly tipoMime = 'application/pdf';

  renderizar(doc: Documento): Promise<Uint8Array> {
    return new Promise((resolver, rejeitar) => {
      const pdf = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: MARGEM,
        bufferPages: true,
        info: { Title: doc.titulo, Producer: 'PrejuZero', Creator: 'PrejuZero' },
      });
      const partes: Buffer[] = [];
      pdf.on('data', (parte: Buffer) => partes.push(parte));
      pdf.on('end', () => {
        resolver(new Uint8Array(Buffer.concat(partes)));
      });
      pdf.on('error', rejeitar);

      const largura = pdf.page.width - 2 * MARGEM;
      const limite = () => pdf.page.height - MARGEM - RODAPE;
      const total = doc.colunas.reduce((soma, c) => soma + c.largura, 0);
      const larguras = doc.colunas.map((c) => (c.largura / total) * largura);

      pdf.font('Helvetica-Bold').fontSize(14).text(doc.titulo);
      pdf
        .font('Helvetica')
        .fontSize(9)
        .text(`Gerado em ${doc.cabecalho.geradoEm} por ${doc.cabecalho.usuario}`);
      const filtros =
        doc.cabecalho.filtros.length === 0
          ? 'Filtro: nenhum'
          : `Filtro: ${doc.cabecalho.filtros.map(([r, v]) => `${r}: ${v}`).join('; ')}`;
      // Histórico verificável (HU35): o QR code fica à direita do cabeçalho e leva à verificação.
      const lado = 72;
      if (doc.verificacao !== undefined) {
        qrCode(pdf, doc.verificacao.url, pdf.page.width - MARGEM - lado, MARGEM, lado);
      }
      const larguraDoTexto = doc.verificacao === undefined ? largura : largura - lado - 12;
      pdf.text(filtros, { width: larguraDoTexto });
      if (doc.cabecalho.aviso !== null) pdf.font('Helvetica-Bold').text(doc.cabecalho.aviso);
      if (doc.verificacao !== undefined) pdf.y = Math.max(pdf.y, MARGEM + lado + 6);
      pdf.moveDown(0.5);

      const linha = (valores: readonly string[], negrito: boolean) => {
        pdf.font(negrito ? 'Helvetica-Bold' : 'Helvetica').fontSize(CORPO);
        const altura =
          Math.max(
            ...valores.map((v, i) => pdf.heightOfString(v, { width: (larguras[i] ?? 0) - 4 })),
          ) + 4;
        if (pdf.y + altura > limite()) {
          pdf.addPage();
          if (!negrito) titulos();
          pdf.font('Helvetica').fontSize(CORPO);
        }
        const topo = pdf.y;
        let x = MARGEM;
        valores.forEach((v, i) => {
          pdf.text(v, x + 2, topo + 2, { width: (larguras[i] ?? 0) - 4 });
          x += larguras[i] ?? 0;
        });
        pdf
          .moveTo(MARGEM, topo + altura)
          .lineTo(MARGEM + largura, topo + altura)
          .lineWidth(0.3)
          .strokeColor('#999999')
          .stroke();
        pdf.x = MARGEM;
        pdf.y = topo + altura;
      };
      const titulos = () => {
        linha(
          doc.colunas.map((c: Coluna) => c.titulo),
          true,
        );
      };

      titulos();
      for (const grupo of doc.grupos) {
        if (grupo.titulo !== null) {
          if (pdf.y + 2 * CORPO + 8 > limite()) {
            pdf.addPage();
            titulos();
          }
          pdf.font('Helvetica-Bold').fontSize(CORPO + 1);
          pdf.text(grupo.titulo, MARGEM, pdf.y + 4);
          pdf.y += 2;
        }
        for (const l of grupo.linhas) {
          linha(
            doc.colunas.map((c) => l[c.chave] ?? ''),
            false,
          );
        }
      }
      if (doc.grupos.every((g) => g.linhas.length === 0)) {
        pdf
          .font('Helvetica')
          .fontSize(CORPO)
          .text('Nenhum resultado.', MARGEM, pdf.y + 4);
      }

      const { start, count } = pdf.bufferedPageRange();
      for (let i = start; i < start + count; i++) {
        pdf.switchToPage(i);
        pdf
          .font('Helvetica')
          .fontSize(7)
          .text(
            `${doc.titulo} · Página ${String(i + 1)} de ${String(count)}`,
            MARGEM,
            pdf.page.height - MARGEM - 10,
            { width: largura, align: 'right', lineBreak: false },
          );
      }
      pdf.end();
    });
  }
}

/** QR code desenhado em vetores (sem imagem): um quadrado por módulo, com a zona de silêncio. */
function qrCode(pdf: PDFKit.PDFDocument, texto: string, x: number, y: number, lado: number) {
  const { modules } = QRCode.create(texto, { errorCorrectionLevel: 'M' });
  const borda = 4;
  const passo = lado / (modules.size + 2 * borda);
  pdf.save().fillColor('#000000');
  for (let linha = 0; linha < modules.size; linha++) {
    for (let coluna = 0; coluna < modules.size; coluna++) {
      if (modules.get(linha, coluna)) {
        pdf.rect(x + (coluna + borda) * passo, y + (linha + borda) * passo, passo, passo);
      }
    }
  }
  pdf.fill().restore();
}
