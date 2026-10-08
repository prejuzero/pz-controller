import { NUMERAL_POR_EXTENSO, lerNumeral } from './numerais.js';
import { evidencia, normalizar, type Evidencia } from './texto.js';

/**
 * Prazo citado no teor (HU20): só **lê** o que o ato diz ("no prazo de 15 (quinze) dias"). Não
 * calcula data nem decide a contagem: isso é do motor de prazos (ADR-008). Quem usa o prazo do ato
 * é o motor, que o compara com a tabela (CPC, art. 218, §1º).
 */
export const UNIDADES_DE_PRAZO = ['dias', 'dias-uteis', 'horas', 'meses', 'anos'] as const;
export type UnidadeDePrazo = (typeof UNIDADES_DE_PRAZO)[number];

export interface PrazoCitado {
  readonly quantidade: number;
  readonly unidade: UnidadeDePrazo;
  /** O texto não diz a unidade ("prazo de 15 (quinze)"): assumido "dias", a conferir. */
  readonly unidadeImplicita: boolean;
  /** Algarismo e extenso discordam ("10 (quinze) dias"): vale o menor (na dúvida, mais cedo). */
  readonly divergente: boolean;
  readonly evidencia: Evidencia;
}

const DIGITOS = '\\d{1,3}';
const UNIDADE = '(dias?\\s+uteis|dias?|horas?|mes(?:es)?|anos?)';
const N = `(${DIGITOS}|${NUMERAL_POR_EXTENSO})`;

// Ordem importa: as formas com parênteses vêm antes da forma simples, que é o fallback.
const PADROES = [
  // "15 (quinze) dias" / "quinze (15) dias"
  new RegExp(`\\b${N}\\s*\\(\\s*${N}\\s*\\)\\s*${UNIDADE}\\b`, 'g'),
  // "48 horas" / "cinco dias uteis"
  new RegExp(`\\b${N}\\s+${UNIDADE}\\b`, 'g'),
  // "prazo de 15 (quinze)" sem unidade
  new RegExp(
    `\\bprazo\\s+de\\s+${N}(?:\\s*\\(\\s*${N}\\s*\\))?(?!\\s*\\(|\\s+(?:dias?|horas?|mes|meses|anos?)\\b)`,
    'g',
  ),
];

const valor = (texto: string | undefined): number | undefined =>
  texto === undefined ? undefined : /^\d+$/.test(texto) ? Number(texto) : lerNumeral(texto);

function unidadeDe(texto: string | undefined): UnidadeDePrazo {
  if (texto === undefined) return 'dias';
  if (/^dias?\s+uteis$/.test(texto)) return 'dias-uteis';
  if (texto.startsWith('dia')) return 'dias';
  if (texto.startsWith('hora')) return 'horas';
  if (texto.startsWith('mes')) return 'meses';
  return 'anos';
}

export function extrairPrazosCitados(teor: string): PrazoCitado[] {
  const texto = normalizar(teor);
  const achados: PrazoCitado[] = [];
  const ocupado = (inicio: number, fim: number) =>
    achados.some((a) => inicio < a.evidencia.fim && fim > a.evidencia.inicio);
  for (const [indice, padrao] of PADROES.entries()) {
    for (const m of texto.matchAll(padrao)) {
      const inicio = m.index;
      const fim = inicio + m[0].length;
      if (ocupado(inicio, fim)) continue;
      const implicita = indice === 2;
      const a = valor(m[1]);
      const b = indice === 1 ? undefined : valor(m[2]);
      const quantidades = [a, b].filter((q): q is number => q !== undefined);
      if (quantidades.length === 0) continue;
      achados.push({
        quantidade: Math.min(...quantidades),
        unidade: unidadeDe(implicita ? undefined : indice === 0 ? m[3] : m[2]),
        unidadeImplicita: implicita,
        divergente: new Set(quantidades).size > 1,
        evidencia: evidencia(teor, inicio, fim),
      });
    }
  }
  return achados.sort((x, y) => x.evidencia.inicio - y.evidencia.inicio);
}
