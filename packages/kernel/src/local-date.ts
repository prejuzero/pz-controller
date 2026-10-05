import { Validacao } from './erros.js';
import { err, ok } from './result.js';

import type { Instant } from './instant.js';
import type { Result } from './result.js';

export const DiaDaSemana = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
} as const;
export type DiaDaSemana = (typeof DiaDaSemana)[keyof typeof DiaDaSemana];

const ANO_MINIMO = 1;
const ANO_MAXIMO = 9999;
const FORMATO_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function bissexto(ano: number): boolean {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
}

function diasNoMes(ano: number, mes: number): number {
  if (mes === 2) return bissexto(ano) ? 29 : 28;
  return [4, 6, 9, 11].includes(mes) ? 30 : 31;
}

// Conversão entre data civil e dias desde 1970-01-01 no calendário gregoriano proléptico
// (algoritmos "days_from_civil" e "civil_from_days" de Howard Hinnant): aritmética inteira,
// sem depender de fuso, relógio ou Date.
function diasDesdeEpoch(ano: number, mes: number, dia: number): number {
  const anoAjustado = mes <= 2 ? ano - 1 : ano;
  const era = Math.floor(anoAjustado / 400);
  const anoDaEra = anoAjustado - era * 400;
  const diaDoAno = Math.floor((153 * (mes + (mes > 2 ? -3 : 9)) + 2) / 5) + dia - 1;
  const diaDaEra =
    anoDaEra * 365 + Math.floor(anoDaEra / 4) - Math.floor(anoDaEra / 100) + diaDoAno;
  return era * 146_097 + diaDaEra - 719_468;
}

function civilDeDias(dias: number): [number, number, number] {
  const deslocado = dias + 719_468;
  const era = Math.floor(deslocado / 146_097);
  const diaDaEra = deslocado - era * 146_097;
  const anoDaEra = Math.floor(
    (diaDaEra -
      Math.floor(diaDaEra / 1460) +
      Math.floor(diaDaEra / 36_524) -
      Math.floor(diaDaEra / 146_096)) /
      365,
  );
  const diaDoAno =
    diaDaEra - (365 * anoDaEra + Math.floor(anoDaEra / 4) - Math.floor(anoDaEra / 100));
  const mesDeslocado = Math.floor((5 * diaDoAno + 2) / 153);
  const dia = diaDoAno - Math.floor((153 * mesDeslocado + 2) / 5) + 1;
  const mes = mesDeslocado < 10 ? mesDeslocado + 3 : mesDeslocado - 9;
  return [anoDaEra + era * 400 + (mes <= 2 ? 1 : 0), mes, dia];
}

const DIAS_MINIMO = diasDesdeEpoch(ANO_MINIMO, 1, 1);
const DIAS_MAXIMO = diasDesdeEpoch(ANO_MAXIMO, 12, 31);

/**
 * Data civil, sem hora nem fuso (ADR-013): a unidade dos prazos processuais. Imutável.
 * Intervalo de 0001-01-01 a 9999-12-31.
 */
export class LocalDate {
  private readonly dias: number;

  private constructor(
    readonly ano: number,
    readonly mes: number,
    readonly dia: number,
  ) {
    this.dias = diasDesdeEpoch(ano, mes, dia);
  }

  static de(ano: number, mes: number, dia: number): LocalDate {
    const valida =
      [ano, mes, dia].every(Number.isInteger) &&
      ano >= ANO_MINIMO &&
      ano <= ANO_MAXIMO &&
      mes >= 1 &&
      mes <= 12 &&
      dia >= 1 &&
      dia <= diasNoMes(ano, mes);
    if (!valida) {
      throw new RangeError(`Data inexistente: ${String(ano)}-${String(mes)}-${String(dia)}`);
    }
    return new LocalDate(ano, mes, dia);
  }

  /** Aceita só `AAAA-MM-DD`. */
  static analisar(texto: string): Result<LocalDate, Validacao> {
    const partes = FORMATO_ISO.exec(texto);
    if (partes !== null) {
      try {
        return ok(LocalDate.de(Number(partes[1]), Number(partes[2]), Number(partes[3])));
      } catch {
        // Data com formato certo, mas inexistente (ex.: 2026-02-30): cai no erro abaixo.
      }
    }
    return err(
      new Validacao(
        [{ campo: 'data', mensagem: 'Use uma data existente no formato AAAA-MM-DD.' }],
        'data.invalida',
        `Data inválida: "${texto}".`,
      ),
    );
  }

  /** Data civil do instante no fuso IANA informado (ex.: o fuso do juízo). */
  static doInstante(instante: Instant, fuso: string): LocalDate {
    const partes = new Intl.DateTimeFormat('en-US', {
      timeZone: fuso,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(new Date(instante.epochMs));
    const valor = (tipo: string) => Number(partes.find((parte) => parte.type === tipo)?.value);
    return LocalDate.de(valor('year'), valor('month'), valor('day'));
  }

  maisDias(quantidade: number): LocalDate {
    if (!Number.isInteger(quantidade)) {
      throw new RangeError(`Quantidade de dias deve ser inteira: ${String(quantidade)}`);
    }
    const destino = this.dias + quantidade;
    if (destino < DIAS_MINIMO || destino > DIAS_MAXIMO) {
      throw new RangeError('Data resultante fora do intervalo 0001-01-01 a 9999-12-31');
    }
    const [ano, mes, dia] = civilDeDias(destino);
    return new LocalDate(ano, mes, dia);
  }

  /** Dias corridos até `outra` (negativo se `outra` for anterior). */
  diasAte(outra: LocalDate): number {
    return outra.dias - this.dias;
  }

  diaDaSemana(): DiaDaSemana {
    // 1970-01-01 foi uma quinta-feira.
    return ((((this.dias + DiaDaSemana.quinta) % 7) + 7) % 7) as DiaDaSemana;
  }

  comparar(outra: LocalDate): number {
    return this.dias - outra.dias;
  }

  ehAntesDe(outra: LocalDate): boolean {
    return this.dias < outra.dias;
  }

  ehDepoisDe(outra: LocalDate): boolean {
    return this.dias > outra.dias;
  }

  igual(outra: LocalDate): boolean {
    return this.dias === outra.dias;
  }

  paraIso(): string {
    const doisDigitos = (valor: number) => String(valor).padStart(2, '0');
    return `${String(this.ano).padStart(4, '0')}-${doisDigitos(this.mes)}-${doisDigitos(this.dia)}`;
  }

  toJSON(): string {
    return this.paraIso();
  }

  toString(): string {
    return this.paraIso();
  }
}
