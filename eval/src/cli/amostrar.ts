import { parseArgs } from 'node:util';

import { amostrar } from '../amostrar.js';
import { lerArquivosDoConjunto } from '../conjunto.js';

/**
 * pnpm --filter @pz/eval amostrar [--tamanho 20] [--semente 123]
 *
 * Sorteia casos para a conferência manual da anonimização. Registre a semente no PR: a mesma
 * semente refaz a mesma amostra.
 */
const { values } = parseArgs({
  options: { tamanho: { type: 'string', default: '20' }, semente: { type: 'string' } },
});
const semente = Number(values.semente ?? Math.floor(Math.random() * 1_000_000));
const arquivos = lerArquivosDoConjunto().map(({ arquivo }) => arquivo);
process.stdout.write(`semente ${String(semente)}\n`);
for (const arquivo of amostrar(arquivos, Number(values.tamanho), semente)) {
  process.stdout.write(`${arquivo}\n`);
}
