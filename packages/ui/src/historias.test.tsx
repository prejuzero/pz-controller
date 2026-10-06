import { TEMAS } from '@pz/design-tokens';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';

import { todasAsHistorias } from './teste/historias.js';

// WCAG 2.1 AA (CLAUDE.md, seção 13), em cada tema: o contraste muda de um para o outro.
const REGRAS_WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

describe.each(TEMAS)('stories no tema %s', (tema) => {
  it.each(todasAsHistorias().map((h) => [h.nome, h] as const))(
    '%s: interações e axe sem violações',
    async (_, historia) => {
      // A play function da story testa o uso por teclado; falha se qualquer expect falhar.
      await historia.run({ globals: { tema } });
      const resultado = await axe.run(document.body, {
        runOnly: { type: 'tag', values: REGRAS_WCAG },
      });
      const violacoes = resultado.violations.map(
        (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
      );
      expect(violacoes).toEqual([]);
    },
  );
});
