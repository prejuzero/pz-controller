import createNextIntlPlugin from 'next-intl/plugin';

import type { NextConfig } from 'next';

// O portal fala com a API na mesma origem (/v1 encaminhado): os cookies __Host- da sessão e o
// CSRF double-submit funcionam sem CORS (ADR-015).
const API_URL = process.env.API_URL ?? 'http://localhost:3000';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Pacotes do monorepo são publicados como TypeScript (exports para src).
  transpilePackages: ['@pz/ui', '@pz/design-tokens', '@pz/contracts'],
  // Os pacotes importam `./x.js` apontando para `./x.ts` (NodeNext). O Turbopack ainda não faz esse
  // mapeamento; por isso o portal usa o webpack (`--webpack` nos scripts).
  experimental: { extensionAlias: { '.js': ['.ts', '.tsx', '.js'] } },
  rewrites: () =>
    Promise.resolve([{ source: '/v1/:caminho*', destination: `${API_URL}/v1/:caminho*` }]),
};

export default createNextIntlPlugin('./src/i18n/requisicao.ts')(config);
