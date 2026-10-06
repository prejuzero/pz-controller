import { limiaresDeCobertura } from '@pz/config/vitest';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Componentes rodam num Chromium real (Vitest browser): foco, teclado e contraste só são
// confiáveis no navegador. As capturas visuais ficam num projeto à parte, executado no container
// do Playwright (scripts/visual.sh) para que a fonte e o antialiasing não variem com o SO.
// Função, não objeto: o Vitest anota cada instância com o nome do projeto, e compartilhar a mesma
// referência faz um projeto rodar com o nome do outro.
const navegador = () => ({
  enabled: true,
  headless: true,
  provider: playwright(),
  instances: [{ browser: 'chromium' as const }],
});

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.stories.tsx', 'src/index.ts', 'src/teste/**'],
      reporter: ['text', 'lcov', 'json-summary'],
      thresholds: { ...limiaresDeCobertura('padrao') },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'componentes',
          setupFiles: ['./src/teste/configurar.ts'],
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: ['src/**/*.visual.test.tsx'],
          browser: navegador(),
        },
      },
      {
        extends: true,
        test: {
          name: 'visual',
          setupFiles: ['./src/teste/configurar.ts'],
          include: ['src/**/*.visual.test.tsx'],
          browser: { ...navegador(), viewport: { width: 800, height: 600 } },
        },
      },
    ],
  },
});
