import { temaNativo } from '@pz/design-tokens';

/** Tokens de design no formato do React Native (ADR-015): os mesmos valores do portal. */
export const temas = { claro: temaNativo('claro'), escuro: temaNativo('escuro') } as const;
export type EsquemaDeCor = keyof typeof temas;

export const temaDoEsquema = (esquema: string | null | undefined) =>
  temas[esquema === 'dark' ? 'escuro' : 'claro'];
