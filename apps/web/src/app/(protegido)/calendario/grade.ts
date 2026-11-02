import { FUSO_PADRAO } from '../../../i18n/configuracao';

/**
 * Aritmética de datas civis (AAAA-MM-DD) para a grade do calendário (HU27). Tudo em UTC sobre a
 * data civil: o fuso do navegador nunca entra, então o prazo cai no mesmo dia em qualquer fuso.
 */
export type Visao = 'mes' | 'semana';

const DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
const DIA_MS = 86_400_000;

function paraUtc(data: string): number {
  const p = DATA.exec(data);
  if (p === null) throw new RangeError(`Data civil inválida: ${data}`);
  return Date.UTC(Number(p[1]), Number(p[2]) - 1, Number(p[3]));
}
const deUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function ehDataCivil(valor: string | null | undefined): valor is string {
  if (valor === null || valor === undefined || !DATA.test(valor)) return false;
  return deUtc(paraUtc(valor)) === valor;
}

export function somarDias(data: string, dias: number): string {
  return deUtc(paraUtc(data) + dias * DIA_MS);
}

/** 0 = domingo. */
export function diaDaSemana(data: string): number {
  return new Date(paraUtc(data)).getUTCDay();
}

export function somarMeses(data: string, meses: number): string {
  const d = new Date(paraUtc(data));
  return deUtc(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + meses, 1));
}

/** Dias exibidos: semanas inteiras de domingo a sábado (a do mês tem 4 a 6 semanas). */
export function diasDaGrade(ancora: string, visao: Visao): string[] {
  const inicio =
    visao === 'semana'
      ? somarDias(ancora, -diaDaSemana(ancora))
      : (() => {
          const primeiro = `${ancora.slice(0, 7)}-01`;
          return somarDias(primeiro, -diaDaSemana(primeiro));
        })();
  const fimDoPeriodo =
    visao === 'semana' ? somarDias(inicio, 6) : somarDias(somarMeses(ancora, 1), -1);
  const dias: string[] = [];
  for (let dia = inicio; dia <= fimDoPeriodo || dias.length % 7 !== 0; dia = somarDias(dia, 1)) {
    dias.push(dia);
  }
  return dias;
}

/** Âncora da tela anterior ou seguinte. */
export function navegar(ancora: string, visao: Visao, passo: 1 | -1): string {
  return visao === 'semana' ? somarDias(ancora, 7 * passo) : somarMeses(ancora, passo);
}

/** Data civil de um instante no fuso de exibição (São Paulo), não no do navegador. */
export function dataNoFuso(instante: Date, fuso: string = FUSO_PADRAO): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instante);
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '';
  return `${parte('year')}-${parte('month')}-${parte('day')}`;
}

/** Hora (HH:mm) de um instante no fuso de exibição. */
export function horaNoFuso(instante: Date, fuso: string = FUSO_PADRAO): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: fuso,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instante);
}

/** Itens agrupados pelo dia civil. */
export function porDia<T>(itens: readonly T[], dia: (item: T) => string | null): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const item of itens) {
    const chave = dia(item);
    if (chave === null) continue;
    mapa.set(chave, [...(mapa.get(chave) ?? []), item]);
  }
  return mapa;
}
