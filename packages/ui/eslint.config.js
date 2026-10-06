// Regras do monorepo + React no navegador (hooks e stories do Storybook).
import base from '@pz/config/eslint';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import storybook from 'eslint-plugin-storybook';
import globals from 'globals';

export default defineConfig(
  { ignores: ['storybook-static/**', '**/__screenshots__/**'] },
  base,
  reactHooks.configs.flat.recommended,
  storybook.configs['flat/recommended'],
  {
    languageOptions: { globals: globals.browser },
    rules: {
      // O lint-staged roda da raiz do monorepo: os addons ficam no package.json deste pacote.
      'storybook/no-uninstalled-addons': [
        'error',
        { packageJsonLocation: `${import.meta.dirname}/package.json` },
      ],
    },
  },
);
