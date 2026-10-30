import { ErroPermanente } from '@pz/integracoes';
import { extractText, getDocumentProxy } from 'unpdf';

import type { ExtratorDeTexto, TextoExtraido } from '@pz/integracoes';

const ADAPTADOR = 'pdf-unpdf';
/** Assinatura dos primeiros bytes de todo PDF ("%PDF-"). */
const ASSINATURA = [0x25, 0x50, 0x44, 0x46, 0x2d];

export function ehPdf(conteudo: Uint8Array): boolean {
  return ASSINATURA.every((byte, i) => conteudo[i] === byte);
}

/**
 * Lê a camada de texto do PDF (ADR-019), localmente, sem rede. PDF escaneado devolve texto
 * vazio: quem chama avisa o advogado para cadastrar à mão (OCR é adaptador futuro).
 */
export class ExtratorPdf implements ExtratorDeTexto {
  async extrairDePdf(conteudo: Uint8Array): Promise<TextoExtraido> {
    if (!ehPdf(conteudo)) throw new ErroPermanente('o arquivo não é um PDF', ADAPTADOR);
    try {
      // Cópia: o pdf.js toma posse do buffer recebido.
      const documento = await getDocumentProxy(new Uint8Array(conteudo));
      const { totalPages, text } = await extractText(documento, { mergePages: true });
      return { texto: text.replace(/[ \t]+\n/g, '\n').trim(), paginas: totalPages };
    } catch (causa) {
      // PDF corrompido ou protegido: não adianta tentar de novo; o advogado cadastra à mão.
      throw new ErroPermanente('não foi possível ler o PDF', ADAPTADOR, { causa });
    }
  }
}
