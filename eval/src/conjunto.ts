import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Pasta dos casos: um arquivo `<id>.json` por caso, para revisão caso a caso no PR. */
export const PASTA_DOS_CASOS = fileURLToPath(new URL('../casos', import.meta.url));

/** Lê os arquivos do conjunto como JSON bruto; quem valida é `verificarConjunto`. */
export function lerArquivosDoConjunto(
  pasta: string = PASTA_DOS_CASOS,
): { arquivo: string; conteudo: unknown }[] {
  return readdirSync(pasta)
    .filter((nome) => nome.endsWith('.json'))
    .sort()
    .map((arquivo) => ({
      arquivo,
      conteudo: JSON.parse(readFileSync(join(pasta, arquivo), 'utf8')) as unknown,
    }));
}
