// Regras do monorepo + React/Next.js no navegador.
import nextPlugin from '@next/eslint-plugin-next';
import base from '@pz/config/eslint';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const SO_PELO_CLIENTE =
  'Use o cliente gerado do OpenAPI (src/api/cliente.ts) pelos hooks de src/api (card PZ-164).';

export default defineConfig(
  { ignores: ['.next/**', 'next-env.d.ts', 'e2e/.relatorio/**', 'e2e/.resultados/**'] },
  base,
  reactHooks.configs.flat.recommended,
  nextPlugin.configs['core-web-vitals'],
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // Nenhuma chamada HTTP manual: toda requisição à API passa pelo cliente gerado.
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: SO_PELO_CLIENTE },
        { name: 'XMLHttpRequest', message: SO_PELO_CLIENTE },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'fetch', message: SO_PELO_CLIENTE },
        { object: 'globalThis', property: 'fetch', message: SO_PELO_CLIENTE },
        { object: 'self', property: 'fetch', message: SO_PELO_CLIENTE },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: ['axios', 'ky', 'ofetch', 'node-fetch', 'undici'].map((name) => ({
            name,
            message: SO_PELO_CLIENTE,
          })),
        },
      ],
    },
  },
);
