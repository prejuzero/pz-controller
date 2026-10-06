import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import type { HasherDeSenha } from '../application/portas.js';

const derivar = promisify(argon2);

/**
 * Argon2id nativo do Node (sem dependência), com os parâmetros mínimos recomendados pela OWASP
 * (Password Storage Cheat Sheet): m = 19 MiB, t = 2, p = 1. Hash no formato PHC, que guarda os
 * parâmetros: dá para endurecê-los depois sem invalidar as senhas existentes.
 */
export const PARAMETROS_ARGON2 = {
  memoria: 19_456,
  passes: 2,
  paralelismo: 1,
  tamanho: 32,
} as const;

const PHC = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

async function calcular(
  senha: string,
  sal: Buffer,
  memoria: number,
  passes: number,
  paralelismo: number,
  tamanho: number,
): Promise<Buffer> {
  return derivar('argon2id', {
    message: Buffer.from(senha.normalize('NFC'), 'utf8'),
    nonce: sal,
    memory: memoria,
    passes,
    parallelism: paralelismo,
    tagLength: tamanho,
  });
}

const b64 = (dados: Buffer) => dados.toString('base64').replace(/=+$/, '');

export class HasherArgon2 implements HasherDeSenha {
  async gerar(senha: string): Promise<string> {
    const { memoria, passes, paralelismo, tamanho } = PARAMETROS_ARGON2;
    const sal = randomBytes(16);
    const hash = await calcular(senha, sal, memoria, passes, paralelismo, tamanho);
    return `$argon2id$v=19$m=${String(memoria)},t=${String(passes)},p=${String(paralelismo)}$${b64(sal)}$${b64(hash)}`;
  }

  async verificar(hashArmazenado: string, senha: string): Promise<boolean> {
    const partes = PHC.exec(hashArmazenado);
    if (partes === null) return false;
    const [, m, t, p, sal, hash] = partes as unknown as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    const esperado = Buffer.from(hash, 'base64');
    const obtido = await calcular(
      senha,
      Buffer.from(sal, 'base64'),
      Number(m),
      Number(t),
      Number(p),
      esperado.length,
    );
    return obtido.length === esperado.length && timingSafeEqual(obtido, esperado);
  }
}
