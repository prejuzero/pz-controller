// Gera o openapi.json e os tipos do cliente TypeScript a partir dos schemas (ADR-009).
// Uso: pnpm --filter @pz/contracts gerar. O CI confere que os arquivos gerados estão em dia.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import openapiTS, { astToString } from 'openapi-typescript';

import { documentoOpenApi } from '../src/index.js';

import type { OpenAPI3 } from 'openapi-typescript';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const documento = documentoOpenApi();

await writeFile(`${raiz}openapi.json`, `${JSON.stringify(documento, null, 2)}\n`);
await mkdir(`${raiz}gerado`, { recursive: true });
const tipos = astToString(await openapiTS(documento as unknown as OpenAPI3));
await writeFile(
  `${raiz}gerado/api.d.ts`,
  `// Gerado por scripts/gerar.ts a partir de openapi.json. Não edite à mão.\n${tipos}`,
);
