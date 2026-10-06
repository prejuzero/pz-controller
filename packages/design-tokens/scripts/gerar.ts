// Gera o CSS dos tokens para o portal (variáveis e tema do Tailwind).
// Uso: pnpm --filter @pz/design-tokens gerar. O CI confere que os arquivos gerados estão em dia.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { gerarTemaTailwind, gerarVariaveisCss } from '../src/index.js';

const destino = fileURLToPath(new URL('../gerado/', import.meta.url));
const cabecalho = '/* Gerado por scripts/gerar.ts a partir de src/tokens.ts. Não edite à mão. */\n';

await mkdir(destino, { recursive: true });
await writeFile(`${destino}tokens.css`, `${cabecalho}${gerarVariaveisCss()}\n`);
await writeFile(`${destino}tema-tailwind.css`, `${cabecalho}${gerarTemaTailwind()}\n`);
