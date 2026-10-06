// Converte os tokens em variáveis CSS (`--pz-*`) e no tema do Tailwind v4 (`@theme inline`).
// Componentes usam só as classes do tema; trocar um valor em tokens.ts muda o portal inteiro.
import {
  breakpoints,
  cores,
  espacamento,
  raios,
  sombras,
  tipografia,
  UNIDADE_ESPACAMENTO,
  type PaletaSemantica,
  type PapelCor,
  type Sombra,
} from './tokens.js';

const PX_POR_REM = 16;

export function kebab(nome: string): string {
  return nome.replace(/[A-Z]/g, (letra) => `-${letra.toLowerCase()}`);
}

function px(valor: number): string {
  return `${String(valor)}px`;
}

export function rem(px: number): string {
  return px === 0 ? '0' : `${String(px / PX_POR_REM)}rem`;
}

export function sombraCss(s: Sombra): string {
  const medidas = [s.x, s.y, s.desfoque, s.espalhamento].map(px).join(' ');
  return `${medidas} rgb(0 0 0 / ${String(s.opacidade)})`;
}

function declaracoes(pares: readonly (readonly [string, string])[], recuo = '  '): string {
  return pares.map(([nome, valor]) => `${recuo}${nome}: ${valor};`).join('\n');
}

function variaveisDeCor(paleta: PaletaSemantica): [string, string][] {
  return (Object.keys(paleta) as PapelCor[]).map((papel) => [
    `--pz-cor-${kebab(papel)}`,
    paleta[papel],
  ]);
}

function variaveisComuns(): [string, string][] {
  return [
    ['--pz-fonte-texto', tipografia.familias.texto],
    ['--pz-fonte-mono', tipografia.familias.mono],
    ...Object.entries(raios).map(([nome, valor]): [string, string] => [
      `--pz-raio-${nome}`,
      nome === 'total' ? px(valor) : rem(valor),
    ]),
    ...Object.entries(sombras).map(([nome, s]): [string, string] => [
      `--pz-sombra-${nome}`,
      sombraCss(s),
    ]),
  ];
}

/**
 * Variáveis CSS dos dois temas. O tema segue o sistema operacional, salvo quando o portal fixa
 * `data-tema="claro"` ou `data-tema="escuro"` no elemento raiz.
 */
export function gerarVariaveisCss(): string {
  const claro = declaracoes([...variaveisDeCor(cores.claro), ...variaveisComuns()]);
  const escuro = declaracoes(variaveisDeCor(cores.escuro));
  const escuroNoSistema = declaracoes(variaveisDeCor(cores.escuro), '    ');
  return [
    `:root {\n${claro}\n  color-scheme: light;\n}`,
    `:root[data-tema='escuro'] {\n${escuro}\n  color-scheme: dark;\n}`,
    `@media (prefers-color-scheme: dark) {\n  :root:not([data-tema='claro']) {\n${escuroNoSistema}\n    color-scheme: dark;\n  }\n}`,
  ].join('\n\n');
}

/** Tema do Tailwind v4 apontando para as variáveis: classes como `bg-primaria` e `text-texto-suave`. */
export function gerarTemaTailwind(): string {
  const pares: [string, string][] = [
    ...Object.keys(cores.claro).map((papel): [string, string] => [
      `--color-${kebab(papel)}`,
      `var(--pz-cor-${kebab(papel)})`,
    ]),
    ['--font-sans', 'var(--pz-fonte-texto)'],
    ['--font-mono', 'var(--pz-fonte-mono)'],
    ['--spacing', rem(UNIDADE_ESPACAMENTO)],
    ...Object.entries(tipografia.tamanhos).flatMap(([nome, t]): [string, string][] => [
      [`--text-${nome}`, rem(t.tamanho)],
      [`--text-${nome}--line-height`, rem(t.alturaLinha)],
    ]),
    ...Object.keys(raios).map((nome): [string, string] => [
      `--radius-${nome}`,
      `var(--pz-raio-${nome})`,
    ]),
    ...Object.keys(sombras).map((nome): [string, string] => [
      `--shadow-${nome}`,
      `var(--pz-sombra-${nome})`,
    ]),
    ...Object.entries(breakpoints).map(([nome, valor]): [string, string] => [
      `--breakpoint-${nome}`,
      rem(valor),
    ]),
  ];
  return `@theme inline {\n${declaracoes(pares)}\n}`;
}

/** Escala de espaçamento em rem, para quem precisar fora do Tailwind. */
export function espacamentoEmRem(): Record<string, string> {
  return Object.fromEntries(Object.entries(espacamento).map(([nome, valor]) => [nome, rem(valor)]));
}
