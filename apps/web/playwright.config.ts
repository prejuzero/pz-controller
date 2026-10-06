import { defineConfig, devices } from '@playwright/test';

/**
 * E2E do portal (PZ-167) contra a pilha do compose (perfil apps): web, api, Postgres e Redis reais.
 * Roda pelo `pnpm e2e` (scripts/e2e.sh), no container de infra/docker/ui-visual.Dockerfile, para
 * que as capturas visuais sejam comparáveis entre a máquina local e o CI.
 * `localhost`: os cookies de sessão são `__Host-` com Secure e só valem em contexto seguro.
 */
export default defineConfig({
  testDir: 'e2e',
  testMatch: /.*\.(e2e|setup|final)\.ts$/,
  outputDir: 'e2e/.resultados',
  snapshotPathTemplate: 'e2e/__screenshots__/{testFilePath}/{arg}{ext}',
  // Um único usuário de demonstração e TOTP com passo de uso único: execução serial.
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'e2e/.relatorio', open: 'never' }]],
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' } },
  use: {
    baseURL: process.env.E2E_URL ?? 'http://localhost:3003',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'sessao', testMatch: /sessao\.setup\.ts$/ },
    {
      name: 'portal',
      testMatch: /\.e2e\.ts$/,
      dependencies: ['sessao'],
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.sessao/estado.json' },
    },
    // Troca a senha: só depois de tudo que usa a sessão compartilhada.
    {
      name: 'recuperacao',
      testMatch: /\.final\.ts$/,
      dependencies: ['portal'],
      use: devices['Desktop Chrome'],
    },
  ],
});
