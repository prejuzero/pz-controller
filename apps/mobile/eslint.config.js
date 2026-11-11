// Regras do monorepo + React Native no app (HU63, ADR-015).
import base from '@pz/config/eslint';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';

const SO_PELO_CLIENTE =
  'Use o cliente gerado do OpenAPI (src/api/cliente.ts) pelos hooks de src/api (HU63).';

export default defineConfig(
  { ignores: ['.expo/**', 'dist/**', 'coverage/**', 'expo-env.d.ts'] },
  base,
  reactHooks.configs.flat.recommended,
  {
    rules: {
      // Nenhuma chamada HTTP manual: toda requisição à API passa pelo cliente gerado.
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: SO_PELO_CLIENTE },
        { name: 'XMLHttpRequest', message: SO_PELO_CLIENTE },
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
