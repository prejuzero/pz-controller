import { TEMAS } from '@pz/design-tokens';
import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';

import { todasAsHistorias } from './teste/historias.js';

// Teste visual por story e tema. Roda só no container (pnpm --filter @pz/ui test:visual).
// Sem animações nem cursor piscando: a captura precisa ser estável entre execuções.
const estilo = document.createElement('style');
estilo.textContent =
  '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }';
document.head.append(estilo);

describe.each(TEMAS)('visual no tema %s', (tema) => {
  it.each(todasAsHistorias().map((h) => [h.nome, h] as const))('%s', async (_, historia) => {
    document.body.style.minHeight = '100vh';
    await historia.run({ globals: { tema } });
    await expect
      .element(page.elementLocator(document.body))
      .toMatchScreenshot(`${historia.id}--${tema}`);
  });
});
