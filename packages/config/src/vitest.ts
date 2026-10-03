import { defineConfig } from 'vitest/config';

/**
 * Perfis de cobertura mínima (CLAUDE.md, seção 13).
 * - motor: packages/motor-prazos (100%).
 * - padrao: módulos e demais pacotes (90%).
 */
export type PerfilCobertura = 'motor' | 'padrao';

export const LIMIAR_COBERTURA: Readonly<Record<PerfilCobertura, number>> = {
  motor: 100,
  padrao: 90,
};

export interface LimiaresCobertura {
  lines: number;
  functions: number;
  branches: number;
  statements: number;
}

export function limiaresDeCobertura(perfil: PerfilCobertura): LimiaresCobertura {
  const limiar = LIMIAR_COBERTURA[perfil];
  return { lines: limiar, functions: limiar, branches: limiar, statements: limiar };
}

export interface OpcoesVitest {
  perfil?: PerfilCobertura;
}

/** Testes unitários ficam em `*.test.ts`; de integração (Testcontainers) em `*.int.test.ts`. */
export const PADRAO_TESTE_UNITARIO = 'src/**/*.test.ts';
export const PADRAO_TESTE_INTEGRACAO = 'src/**/*.int.test.ts';

export function criarConfigVitest(opcoes: OpcoesVitest = {}) {
  const perfil = opcoes.perfil ?? 'padrao';
  return defineConfig({
    test: {
      include: [PADRAO_TESTE_UNITARIO],
      exclude: [PADRAO_TESTE_INTEGRACAO, '**/node_modules/**', '**/dist/**'],
      passWithNoTests: true,
      coverage: {
        provider: 'v8',
        include: ['src/**/*.ts'],
        exclude: ['src/**/*.test.ts', 'src/**/*.int.test.ts'],
        reporter: ['text', 'lcov', 'json-summary'],
        thresholds: { ...limiaresDeCobertura(perfil) },
      },
    },
  });
}

export function criarConfigVitestIntegracao() {
  return defineConfig({
    test: {
      include: [PADRAO_TESTE_INTEGRACAO],
      exclude: ['**/node_modules/**', '**/dist/**'],
      passWithNoTests: true,
      testTimeout: 60_000,
      hookTimeout: 120_000,
    },
  });
}
