/** Numerais cardinais por extenso (0 a 999), em texto já normalizado (minúsculo, sem acento). */
const UNIDADES: Readonly<Record<string, number>> = {
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
  cento: 100,
  duzentos: 200,
  duzentas: 200,
  trezentos: 300,
  trezentas: 300,
  quatrocentos: 400,
  quatrocentas: 400,
  quinhentos: 500,
  quinhentas: 500,
  seiscentos: 600,
  seiscentas: 600,
  setecentos: 700,
  setecentas: 700,
  oitocentos: 800,
  oitocentas: 800,
  novecentos: 900,
  novecentas: 900,
};

const PALAVRA = Object.keys(UNIDADES)
  .sort((a, b) => b.length - a.length)
  .join('|');

/** Expressão (sem grupos de captura) de um numeral por extenso: "cento e vinte e cinco". */
export const NUMERAL_POR_EXTENSO = `(?:${PALAVRA})(?:\\s+e\\s+(?:${PALAVRA}))*`;

/**
 * Valor de um numeral por extenso, ou undefined se não for um numeral bem formado (cada parte
 * menor que a anterior: "vinte e cinco" sim, "cinco e vinte" não).
 */
export function lerNumeral(texto: string): number | undefined {
  const partes = texto.trim().split(/\s+e\s+/);
  let total = 0;
  let anterior = Number.POSITIVE_INFINITY;
  for (const parte of partes) {
    const valor = UNIDADES[parte];
    if (valor === undefined || valor >= anterior || (valor === 0 && partes.length > 1)) {
      return undefined;
    }
    total += valor;
    anterior = valor;
  }
  return total;
}
