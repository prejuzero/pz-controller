// Formato consumível pelo React Native (app futuro, ADR-015): números em vez de rem e sombras
// nas propriedades `shadow*`/`elevation` do StyleSheet.
import {
  breakpoints,
  cores,
  espacamento,
  raios,
  sombras,
  tipografia,
  type PaletaSemantica,
  type Sombra,
  type Tema,
} from './tokens.js';

export interface SombraNativa {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

export interface TemaNativo {
  cores: PaletaSemantica;
  espacamento: typeof espacamento;
  raios: typeof raios;
  tamanhosFonte: typeof tipografia.tamanhos;
  pesosFonte: typeof tipografia.pesos;
  sombras: Record<keyof typeof sombras, SombraNativa>;
  breakpoints: typeof breakpoints;
}

function sombraNativa(s: Sombra): SombraNativa {
  return {
    shadowColor: '#000000',
    shadowOffset: { width: s.x, height: s.y },
    shadowOpacity: s.opacidade,
    shadowRadius: s.desfoque / 2,
    // Aproximação do Android: a elevação acompanha o deslocamento vertical.
    elevation: s.y,
  };
}

export function temaNativo(tema: Tema): TemaNativo {
  return {
    cores: { ...cores[tema] },
    espacamento,
    raios,
    tamanhosFonte: tipografia.tamanhos,
    pesosFonte: tipografia.pesos,
    sombras: {
      sm: sombraNativa(sombras.sm),
      md: sombraNativa(sombras.md),
      lg: sombraNativa(sombras.lg),
    },
    breakpoints,
  };
}
