import { Validacao } from './erros.js';
import { err, ok } from './result.js';

import type { Result } from './result.js';

/** Limite do Date do ECMAScript: ±100 milhões de dias a partir de 1970. */
const LIMITE_EPOCH_MS = 8.64e15;

const FORMATO_ISO =
  /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/**
 * Um ponto no tempo, em UTC, com precisão de milissegundos (ADR-013). Para datas jurídicas
 * (dias de prazo) use LocalDate.
 */
export class Instant {
  private constructor(readonly epochMs: number) {}

  static deEpochMs(epochMs: number): Instant {
    if (!Number.isInteger(epochMs) || Math.abs(epochMs) > LIMITE_EPOCH_MS) {
      throw new RangeError(`Instante fora do intervalo: ${String(epochMs)}`);
    }
    return new Instant(epochMs);
  }

  /** Exige fuso explícito (`Z` ou `±hh:mm`): um horário sem fuso é ambíguo. */
  static deIso(texto: string): Instant {
    const resultado = Instant.analisar(texto);
    if (!resultado.ok) throw new RangeError(resultado.erro.message);
    return resultado.valor;
  }

  static analisar(texto: string): Result<Instant, Validacao> {
    const partes = FORMATO_ISO.exec(texto);
    const invalido = err(
      new Validacao(
        [{ campo: 'instante', mensagem: 'Use data e hora ISO 8601 com fuso.' }],
        'instante.invalido',
        `Instante inválido: "${texto}".`,
      ),
    );
    if (partes === null) return invalido;
    const [ano, mes, dia] = partes.slice(1, 4).map(Number) as [number, number, number];
    // Date.parse aceitaria "2026-02-30" rolando para março: a data precisa existir.
    if (mes < 1 || mes > 12 || dia < 1 || dia > diasNoMes(ano, mes)) return invalido;
    const epochMs = Date.parse(texto);
    return Number.isNaN(epochMs) ? invalido : ok(new Instant(epochMs));
  }

  maisMs(ms: number): Instant {
    return Instant.deEpochMs(this.epochMs + ms);
  }

  msAte(outro: Instant): number {
    return outro.epochMs - this.epochMs;
  }

  comparar(outro: Instant): number {
    return this.epochMs - outro.epochMs;
  }

  ehAntesDe(outro: Instant): boolean {
    return this.epochMs < outro.epochMs;
  }

  ehDepoisDe(outro: Instant): boolean {
    return this.epochMs > outro.epochMs;
  }

  igual(outro: Instant): boolean {
    return this.epochMs === outro.epochMs;
  }

  paraIso(): string {
    return new Date(this.epochMs).toISOString();
  }

  toJSON(): string {
    return this.paraIso();
  }

  toString(): string {
    return this.paraIso();
  }
}
