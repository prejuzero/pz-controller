import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { anonimizar } from '../anonimizar.js';

/**
 * pnpm --filter @pz/eval anonimizar <arquivo.txt> [--nome "Fulano de Tal"]...
 *
 * Lê o teor de um arquivo FORA do repositório e imprime o texto anonimizado; as suspeitas de
 * nome saem no stderr para a conferência humana. Nada é gravado em disco.
 */
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { nome: { type: 'string', multiple: true } },
});
const [arquivo] = positionals;
if (arquivo === undefined) {
  process.stderr.write('uso: anonimizar <arquivo.txt> [--nome "Nome da parte"]...\n');
  process.exit(2);
}
const { texto, suspeitas } = anonimizar(readFileSync(arquivo, 'utf8'), values.nome ?? []);
process.stdout.write(`${texto}\n`);
if (suspeitas.length > 0) {
  process.stderr.write(`\nconferir à mão (parecem nomes):\n- ${suspeitas.join('\n- ')}\n`);
}
