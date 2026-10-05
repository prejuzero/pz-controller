// Configuração ESLint compartilhada por todo o monorepo (CLAUDE.md, seções 3 e 8).
import js from '@eslint/js';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// O domínio e o motor de prazos não podem ler o relógio do sistema: usam a porta Clock (ADR-013).
const proibirRelogioDoSistema = {
  files: [
    'modules/*/domain/**/*.ts',
    'modules/*/application/**/*.ts',
    'packages/motor-prazos/**/*.ts',
  ],
  ignores: ['**/*.test.ts', '**/*.spec.ts'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: "NewExpression[callee.name='Date']",
        message: 'Use a porta Clock do kernel em vez de new Date() (CLAUDE.md, seção 3).',
      },
      {
        selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
        message: 'Use a porta Clock do kernel em vez de Date.now() (CLAUDE.md, seção 3).',
      },
    ],
  },
};

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.next/**',
      '**/.turbo/**',
      // Código gerado (ex.: tipos do cliente da API em packages/contracts/gerado).
      '**/gerado/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  eslintComments.recommended,
  {
    plugins: { 'import-x': importX },
    languageOptions: {
      parserOptions: { projectService: true },
      globals: globals.node,
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': true, 'ts-nocheck': true, 'ts-expect-error': 'allow-with-description' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      // Desativar uma regra exige justificativa na mesma linha (CLAUDE.md, seção 3).
      '@eslint-community/eslint-comments/require-description': 'error',
      '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import-x/no-duplicates': 'error',
    },
  },
  proibirRelogioDoSistema,
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
  },
  prettier,
);
