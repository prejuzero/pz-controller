#!/usr/bin/env node
// Build de produção das apps (api, worker): empacota src/main.ts e src/instrumentacao.ts com o
// código dos pacotes @pz/* (TypeScript, que o Node não executa direto). Bibliotecas de terceiros
// ficam externas: as instrumentações do OpenTelemetry só alcançam módulos carregados pelo Node.
// Na imagem, `pnpm deploy` com node-linker=hoisted as instala ao lado do dist.
import { rm } from 'node:fs/promises';

import { build } from 'esbuild';

const somenteMonorepo = {
  name: 'somente-monorepo',
  setup(construtor) {
    construtor.onResolve({ filter: /^[^./]/ }, (argumentos) =>
      argumentos.path.startsWith('@pz/') ? undefined : { path: argumentos.path, external: true },
    );
  },
};

await rm('dist', { recursive: true, force: true });
await build({
  entryPoints: ['src/main.ts', 'src/instrumentacao.ts'],
  outdir: 'dist',
  bundle: true,
  // Pedaços compartilhados: o main importa a mesma instância de instrumentacao.js carregada no --import.
  splitting: true,
  format: 'esm',
  platform: 'node',
  target: 'node24',
  sourcemap: true,
  tsconfig: 'tsconfig.json',
  plugins: [somenteMonorepo],
  logLevel: 'warning',
});
