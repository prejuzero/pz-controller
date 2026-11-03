/**
 * Porta: chaves de dados da aplicação (HU37, PZ-219; ADR-021). As chaves de dados cifram os
 * campos sensíveis (segredo do 2FA, CPF, documento do cliente) e são, elas próprias, protegidas
 * pela chave mestra: localmente derivadas dela; em produção, desembrulhadas pelo KMS no boot.
 * A interface é síncrona porque o uso é por campo, em toda leitura; o custo do KMS fica no boot.
 */
export interface ChaveDeDados {
  /** Identificador gravado junto do dado cifrado (permite a rotação). */
  readonly id: string;
  /** 32 bytes (AES-256). */
  readonly chave: Uint8Array;
}

export interface ProvedorChaves {
  /** Chave usada para cifrar daqui em diante. */
  ativa(): ChaveDeDados;
  /** Chave pelo id, para decifrar dados de antes da rotação. */
  porId(id: string): ChaveDeDados | undefined;
  /** Chave do índice cego (HMAC), separada das de cifra e estável (não roda). */
  indice(): Uint8Array;
}
