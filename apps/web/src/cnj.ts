import { formatarNumeroCnj, lerNumeroCnj, tribunalDoNumero } from '@pz/contracts';

/**
 * Número CNJ no formulário de processo (HU12). A conferência do dígito é a mesma função pura do
 * domínio (Resolução CNJ 65/2008); a API valida de novo no cadastro.
 */

// 20 dígitos com ou sem a pontuação do CNJ, em qualquer ponto de um texto colado.
const CANDIDATO = /\d{7}[-.\s]?\d{2}[.\s]?\d{4}[.\s]?\d[.\s]?\d{2}[.\s]?\d{4}/g;

/**
 * Primeiro número CNJ válido dentro de um texto colado (ex.: trecho de intimação), já formatado.
 * undefined se nenhum candidato tiver dígito verificador correto.
 */
export function detectarCnj(texto: string): string | undefined {
  for (const [candidato] of texto.matchAll(CANDIDATO)) {
    const partes = lerNumeroCnj(candidato);
    if (partes !== undefined) return formatarNumeroCnj(partes);
  }
  return undefined;
}

/** NNNNNNN-DD.AAAA.J.TR.OOOO, preenchido conforme a digitação. */
export function mascararCnj(texto: string): string {
  const d = texto.replace(/\D/g, '').slice(0, 20);
  const blocos: [number, string][] = [
    [7, ''],
    [9, '-'],
    [13, '.'],
    [14, '.'],
    [16, '.'],
    [20, '.'],
  ];
  let resultado = '';
  let inicio = 0;
  for (const [fim, separador] of blocos) {
    if (d.length <= inicio) break;
    resultado += separador + d.slice(inicio, fim);
    inicio = fim;
  }
  return resultado;
}

export type SituacaoCnj =
  | { tipo: 'incompleto' }
  | { tipo: 'invalido' }
  | { tipo: 'valido'; formatado: string; tribunal: string | undefined };

/** Validação instantânea: só acusa erro com os 20 dígitos digitados. */
export function situacaoCnj(texto: string): SituacaoCnj {
  if (texto.replace(/\D/g, '').length < 20) return { tipo: 'incompleto' };
  const partes = lerNumeroCnj(texto);
  if (partes === undefined) return { tipo: 'invalido' };
  return {
    tipo: 'valido',
    formatado: formatarNumeroCnj(partes),
    tribunal: tribunalDoNumero(partes)?.sigla,
  };
}
