import { Validacao } from '../erros.js';
import { err, ok } from '../result.js';

import type { Result } from '../result.js';

/**
 * Número único do processo (Resolução CNJ 65/2008, art. 1º): NNNNNNN-DD.AAAA.J.TR.OOOO, com
 * sequencial (7), dígito verificador (2), ano do ajuizamento (4), segmento do Judiciário (1),
 * tribunal (2) e unidade de origem (4). Fonte: https://atos.cnj.jus.br/atos/detalhar/119
 */
export interface PartesDoNumeroCnj {
  readonly sequencial: string;
  readonly digito: string;
  readonly ano: string;
  /** "J": 1 STF, 2 CNJ, 3 STJ, 4 Federal, 5 Trabalho, 6 Eleitoral, 7 Militar da União, 8 Estadual, 9 Militar estadual. */
  readonly segmento: string;
  /** "TR": código do tribunal dentro do segmento ("00" para os tribunais superiores). */
  readonly tribunal: string;
  readonly origem: string;
}

/** Só pontuação e espaços são ignorados; qualquer outro caractere invalida o número. */
const SEPARADORES = /[\s.-]/g;
const VINTE_DIGITOS = /^\d{20}$/;

/**
 * Dígito verificador pelo módulo 97 da ISO 7064, como define a Resolução CNJ 65/2008:
 * 98 − (NNNNNNN AAAA J TR OOOO 00 mod 97), com dois dígitos.
 */
export function calcularDigitoCnj(partes: Omit<PartesDoNumeroCnj, 'digito'>): string {
  const { sequencial, ano, segmento, tribunal, origem } = partes;
  const base = BigInt(`${sequencial}${ano}${segmento}${tribunal}${origem}00`);
  return String(98n - (base % 97n)).padStart(2, '0');
}

/**
 * Lê o número com ou sem pontuação e confere o dígito verificador. Função pura, usada também
 * pelo portal (via @pz/contracts). undefined quando o número é inválido.
 */
export function lerNumeroCnj(texto: string): PartesDoNumeroCnj | undefined {
  const numero = texto.replace(SEPARADORES, '');
  if (!VINTE_DIGITOS.test(numero)) return undefined;
  const partes: PartesDoNumeroCnj = {
    sequencial: numero.slice(0, 7),
    digito: numero.slice(7, 9),
    ano: numero.slice(9, 13),
    segmento: numero.slice(13, 14),
    tribunal: numero.slice(14, 16),
    origem: numero.slice(16, 20),
  };
  // O segmento 0 não existe na Resolução CNJ 65/2008 (segmentos de 1 a 9).
  if (partes.segmento === '0') return undefined;
  return calcularDigitoCnj(partes) === partes.digito ? partes : undefined;
}

/** Formato de exibição da Resolução CNJ 65/2008: NNNNNNN-DD.AAAA.J.TR.OOOO. */
export function formatarNumeroCnj(partes: PartesDoNumeroCnj): string {
  const { sequencial, digito, ano, segmento, tribunal, origem } = partes;
  return `${sequencial}-${digito}.${ano}.${segmento}.${tribunal}.${origem}`;
}

/** Value object do número do processo; igualdade pelo número normalizado (20 dígitos). */
export class NumeroCnj {
  private constructor(readonly partes: PartesDoNumeroCnj) {}

  static de(texto: string, campo = 'numeroCnj'): Result<NumeroCnj, Validacao> {
    const partes = lerNumeroCnj(texto);
    return partes === undefined
      ? err(new Validacao([{ campo, mensagem: 'Número CNJ inválido.' }]))
      : ok(new NumeroCnj(partes));
  }

  /** Só os 20 dígitos: forma canônica para gravar e comparar. */
  get valor(): string {
    return formatarNumeroCnj(this.partes).replace(SEPARADORES, '');
  }

  formatado(): string {
    return formatarNumeroCnj(this.partes);
  }

  igual(outro: NumeroCnj): boolean {
    return this.valor === outro.valor;
  }
}
