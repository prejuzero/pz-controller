import { jsonCanonico } from './canonico.js';

/** Hash anterior do primeiro registro de cada tenant (gênese da cadeia). */
export const HASH_GENESE = '0'.repeat(64);

/** Campos do registro que entram no hash (tudo, menos os próprios hashes). */
export interface RegistroDeAuditoria {
  readonly id: string;
  readonly tenantId: string;
  readonly sequencia: number;
  readonly tipo: string;
  readonly entidade: string;
  readonly entidadeId: string;
  readonly usuarioId: string | null;
  readonly usuarioRealId: string | null;
  readonly canal: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly antes: unknown;
  readonly depois: unknown;
  /** Instante do banco, em ISO 8601 UTC com milissegundos. */
  readonly criadoEm: string;
}

export interface RegistroEncadeado extends RegistroDeAuditoria {
  readonly hashAnterior: string;
  readonly hash: string;
}

export type Sha256 = (texto: string) => string;

/** hash = SHA-256(hash_anterior || JSON canônico do registro sem os hashes) — ADR-006. */
export function calcularHash(
  hashAnterior: string,
  registro: RegistroDeAuditoria,
  sha256: Sha256,
): string {
  return sha256(hashAnterior + jsonCanonico(registro));
}

export type ResultadoDaVerificacao =
  | {
      readonly valida: true;
      readonly ultimo: { readonly sequencia: number; readonly hash: string } | undefined;
    }
  | { readonly valida: false; readonly sequencia: number; readonly motivo: string };

/**
 * Confere um trecho da cadeia de um tenant, em ordem de sequência: sem buracos, cada registro
 * apontando para o hash do anterior e com o próprio hash recalculado igual ao gravado.
 * Limite de toda cadeia de hash: apagar os últimos registros não quebra os elos. Por isso o
 * verificador compara `ultimo` com a âncora externa (a cabeça da cadeia gravada no WORM).
 */
export function verificarCadeia(
  registros: readonly RegistroEncadeado[],
  sha256: Sha256,
  desde: { readonly sequencia: number; readonly hash: string } = {
    sequencia: 0,
    hash: HASH_GENESE,
  },
): ResultadoDaVerificacao {
  let anterior = desde;
  for (const registro of registros) {
    const { hash, hashAnterior, ...semHash } = registro;
    if (registro.sequencia !== anterior.sequencia + 1) {
      return {
        valida: false,
        sequencia: registro.sequencia,
        motivo: `sequência esperada ${String(anterior.sequencia + 1)}`,
      };
    }
    if (hashAnterior !== anterior.hash) {
      return { valida: false, sequencia: registro.sequencia, motivo: 'hash anterior não confere' };
    }
    if (calcularHash(hashAnterior, semHash, sha256) !== hash) {
      return {
        valida: false,
        sequencia: registro.sequencia,
        motivo: 'conteúdo alterado (hash não confere)',
      };
    }
    anterior = { sequencia: registro.sequencia, hash };
  }
  return { valida: true, ultimo: registros.length === 0 ? undefined : anterior };
}
