import { describe, expect, it } from 'vitest';

import {
  espacamentoEmRem,
  gerarTemaTailwind,
  gerarVariaveisCss,
  kebab,
  rem,
  sombraCss,
} from './css.js';
import { cores } from './tokens.js';

describe('conversões', () => {
  it('kebab, rem e sombra', () => {
    expect(kebab('superficieElevada')).toBe('superficie-elevada');
    expect(rem(0)).toBe('0');
    expect(rem(24)).toBe('1.5rem');
    expect(sombraCss({ x: 0, y: 1, desfoque: 2, espalhamento: 0, opacidade: 0.06 })).toBe(
      '0px 1px 2px 0px rgb(0 0 0 / 0.06)',
    );
    expect(espacamentoEmRem()['4']).toBe('1rem');
  });
});

describe('gerarVariaveisCss', () => {
  const css = gerarVariaveisCss();

  it('declara todos os papéis de cor nos dois temas', () => {
    for (const [papel, valor] of Object.entries(cores.claro)) {
      expect(css).toContain(`--pz-cor-${kebab(papel)}: ${valor};`);
    }
    for (const [papel, valor] of Object.entries(cores.escuro)) {
      expect(css).toContain(`--pz-cor-${kebab(papel)}: ${valor};`);
    }
  });

  it('o tema escuro vale pelo sistema ou fixado no elemento raiz', () => {
    expect(css).toContain(":root[data-tema='escuro']");
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain(":root:not([data-tema='claro'])");
  });

  it('raio total fica em px e os demais em rem', () => {
    expect(css).toContain('--pz-raio-total: 9999px;');
    expect(css).toContain('--pz-raio-md: 0.5rem;');
  });
});

describe('gerarTemaTailwind', () => {
  const tema = gerarTemaTailwind();

  it('liga as classes do Tailwind às variáveis, sem valores fixos de cor', () => {
    expect(tema.startsWith('@theme inline {')).toBe(true);
    expect(tema).toContain('--color-primaria-texto: var(--pz-cor-primaria-texto);');
    expect(tema).not.toMatch(/--color-[a-z-]+: #/);
  });

  it('inclui espaçamento, tipografia, raios, sombras e breakpoints', () => {
    expect(tema).toContain('--spacing: 0.25rem;');
    expect(tema).toContain('--text-base: 1rem;');
    expect(tema).toContain('--text-base--line-height: 1.5rem;');
    expect(tema).toContain('--radius-lg: var(--pz-raio-lg);');
    expect(tema).toContain('--shadow-md: var(--pz-sombra-md);');
    expect(tema).toContain('--breakpoint-md: 48rem;');
  });
});
