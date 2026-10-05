import { defineConfig } from 'vitest/config';

/**
 * Perfis de cobertura mínima (CLAUDE.md, seção 13).
 * - motor: packages/motor-prazos (100%).
 * - kernel: packages/kernel (100%, card PZ-90): base de todos os módulos.
 * - padrao: módulos e demais pacotes (90%).
 */
export type PerfilCobertura = 'motor' | 'kernel' | 'padrao';

export const LIMIAR_COBERTURA: Readonly<Record<PerfilCobertura, number>> = {
  motor: 100,
  kernel: 100,
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
  /**
   * Onde fica o código: `src` (pacotes e apps) ou `modulo` (camadas domain/, application/ e
   * infra/ na raiz do módulo, com o index.ts público, CLAUDE.md seção 6).
   */
  layout?: 'src' | 'modulo';
  /**
   * Pontos de entrada do processo (ex.: src/main.ts), fora da cobertura unitária. Só para
   * código coberto por um teste de boot do processo real.
   */
  pontosDeEntrada?: readonly string[];
}

const LAYOUTS = {
  src: { raizes: ['src'], extras: [] as string[] },
  modulo: { raizes: ['domain', 'application', 'infra'], extras: ['index.ts'] },
};

/** Testes unitários ficam em `*.test.ts`; de integração (Testcontainers) em `*.int.test.ts`. */
export const PADRAO_TESTE_UNITARIO = 'src/**/*.test.ts';
export const PADRAO_TESTE_INTEGRACAO = 'src/**/*.int.test.ts';

export function criarConfigVitest(opcoes: OpcoesVitest = {}) {
  const perfil = opcoes.perfil ?? 'padrao';
  const { raizes, extras } = LAYOUTS[opcoes.layout ?? 'src'];
  const unitarios = raizes.map((raiz) => `${raiz}/**/*.test.ts`);
  return defineConfig({
    test: {
      include: opcoes.layout === 'modulo' ? unitarios : [PADRAO_TESTE_UNITARIO],
      exclude: [PADRAO_TESTE_INTEGRACAO, '**/*.int.test.ts', '**/node_modules/**', '**/dist/**'],
      passWithNoTests: true,
      coverage: {
        provider: 'v8',
        include: [...raizes.map((raiz) => `${raiz}/**/*.ts`), ...extras],
        exclude: ['**/*.test.ts', '**/*.int.test.ts', ...(opcoes.pontosDeEntrada ?? [])],
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
