/** Texto extraído de um documento enviado pelo advogado (HU25, ADR-019). */
export interface TextoExtraido {
  /** Texto na ordem de leitura; vazio quando o documento não tem camada de texto (escaneado). */
  readonly texto: string;
  readonly paginas: number;
}

/**
 * Porta: extrai o texto de um PDF (ADR-019). O adaptador atual lê a camada de texto, sem rede;
 * OCR de documento escaneado entra como outro adaptador. PDF inválido lança `ErroPermanente`.
 */
export interface ExtratorDeTexto {
  extrairDePdf(conteudo: Uint8Array): Promise<TextoExtraido>;
}
