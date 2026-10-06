import { fileURLToPath } from 'node:url';

import createNextIntlPlugin from 'next-intl/plugin';

import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Imagem enxuta (infra/docker/web.Dockerfile): server.js com só as dependências rastreadas, a
  // partir da raiz do monorepo. O /v1 é encaminhado em src/proxy.ts (API_URL lida em execução).
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
  // Pacotes do monorepo são publicados como TypeScript (exports para src).
  transpilePackages: ['@pz/ui', '@pz/design-tokens', '@pz/contracts'],
  // Os pacotes importam `./x.js` apontando para `./x.ts` (NodeNext). O Turbopack ainda não faz esse
  // mapeamento; por isso o portal usa o webpack (`--webpack` nos scripts).
  experimental: { extensionAlias: { '.js': ['.ts', '.tsx', '.js'] } },
};

export default createNextIntlPlugin('./src/i18n/requisicao.ts')(config);
