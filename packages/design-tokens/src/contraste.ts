// Razão de contraste da WCAG 2.1 (critérios 1.4.3 e 1.4.11), usada para garantir que os
// tokens atendem ao nível AA nos dois temas.

/** Contraste mínimo AA para texto normal. */
export const CONTRASTE_MINIMO_TEXTO = 4.5;
/** Contraste mínimo AA para componentes de interface e indicador de foco. */
export const CONTRASTE_MINIMO_INTERFACE = 3;

const HEX = /^#([0-9a-f]{6})$/i;

function canal(valor: number): number {
  const c = valor / 255;
  return c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Luminância relativa de uma cor `#rrggbb`. */
export function luminancia(cor: string): number {
  const hex = HEX.exec(cor)?.[1];
  if (hex === undefined) throw new Error(`Cor inválida: ${cor} (use #rrggbb)`);
  const numero = Number.parseInt(hex, 16);
  const r = canal((numero >> 16) & 0xff);
  const g = canal((numero >> 8) & 0xff);
  const b = canal(numero & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste entre duas cores, de 1 a 21. */
export function razaoContraste(a: string, b: string): number {
  const [clara, escura] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (clara + 0.05) / (escura + 0.05);
}
