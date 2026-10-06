// Tokens de design como dados puros (ADR-015): a única fonte de cores, tipografia, espaçamento,
// raios, sombras e breakpoints do portal web e do futuro app mobile. Medidas em px (número),
// convertidas para rem no CSS e usadas direto no React Native.

export const TEMAS = ['claro', 'escuro'] as const;
export type Tema = (typeof TEMAS)[number];

/** Papéis semânticos de cor. Componentes usam o papel, nunca o valor. */
export interface PaletaSemantica {
  fundo: string;
  superficie: string;
  superficieElevada: string;
  texto: string;
  textoSuave: string;
  borda: string;
  bordaForte: string;
  foco: string;
  primaria: string;
  primariaTexto: string;
  primariaSuave: string;
  sucesso: string;
  sucessoTexto: string;
  alerta: string;
  alertaTexto: string;
  perigo: string;
  perigoTexto: string;
  info: string;
  infoTexto: string;
  /** Destaque das sugestões geradas por IA (ADR-015/ADR-016: "sugerido por IA"). */
  ia: string;
  iaTexto: string;
}

export type PapelCor = keyof PaletaSemantica;

export const cores: Readonly<Record<Tema, Readonly<PaletaSemantica>>> = {
  claro: {
    fundo: '#ffffff',
    superficie: '#f8fafc',
    superficieElevada: '#ffffff',
    texto: '#0f172a',
    textoSuave: '#475569',
    borda: '#e2e8f0',
    bordaForte: '#64748b',
    foco: '#1d4ed8',
    primaria: '#1d4ed8',
    primariaTexto: '#ffffff',
    primariaSuave: '#dbeafe',
    sucesso: '#15803d',
    sucessoTexto: '#ffffff',
    alerta: '#b45309',
    alertaTexto: '#ffffff',
    perigo: '#b91c1c',
    perigoTexto: '#ffffff',
    info: '#0369a1',
    infoTexto: '#ffffff',
    ia: '#6d28d9',
    iaTexto: '#ffffff',
  },
  escuro: {
    fundo: '#0b1120',
    superficie: '#111827',
    superficieElevada: '#1f2937',
    texto: '#f1f5f9',
    textoSuave: '#94a3b8',
    borda: '#334155',
    bordaForte: '#94a3b8',
    foco: '#93c5fd',
    primaria: '#60a5fa',
    primariaTexto: '#0b1120',
    primariaSuave: '#1e3a8a',
    sucesso: '#4ade80',
    sucessoTexto: '#0b1120',
    alerta: '#fbbf24',
    alertaTexto: '#0b1120',
    perigo: '#f87171',
    perigoTexto: '#0b1120',
    info: '#38bdf8',
    infoTexto: '#0b1120',
    ia: '#a78bfa',
    iaTexto: '#0b1120',
  },
};

export const tipografia = {
  familias: {
    texto: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
  },
  /** Tamanho e altura de linha em px. */
  tamanhos: {
    xs: { tamanho: 12, alturaLinha: 16 },
    sm: { tamanho: 14, alturaLinha: 20 },
    base: { tamanho: 16, alturaLinha: 24 },
    lg: { tamanho: 18, alturaLinha: 28 },
    xl: { tamanho: 20, alturaLinha: 28 },
    '2xl': { tamanho: 24, alturaLinha: 32 },
    '3xl': { tamanho: 30, alturaLinha: 36 },
  },
  pesos: { normal: 400, medio: 500, seminegrito: 600, negrito: 700 },
} as const;

/** Unidade base da escala de espaçamento, em px (Tailwind multiplica por ela). */
export const UNIDADE_ESPACAMENTO = 4;

/** Escala de espaçamento em px, nomeada pelo múltiplo da unidade base. */
export const espacamento = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

/** Raios em px; `total` gera pílulas e círculos. */
export const raios = { sm: 4, md: 8, lg: 12, total: 9999 } as const;

/** Sombras descritas como dados, para virar `box-shadow` no CSS e `shadow*` no React Native. */
export interface Sombra {
  x: number;
  y: number;
  desfoque: number;
  espalhamento: number;
  opacidade: number;
}

export const sombras: Readonly<Record<'sm' | 'md' | 'lg', Sombra>> = {
  sm: { x: 0, y: 1, desfoque: 2, espalhamento: 0, opacidade: 0.06 },
  md: { x: 0, y: 4, desfoque: 8, espalhamento: -2, opacidade: 0.1 },
  lg: { x: 0, y: 12, desfoque: 24, espalhamento: -4, opacidade: 0.14 },
};

/** Larguras mínimas em px. O portal é utilizável a partir de 360 px (HU23). */
export const breakpoints = { sm: 640, md: 768, lg: 1024, xl: 1280 } as const;

/** Menor largura de tela suportada, em px. */
export const LARGURA_MINIMA = 360;
