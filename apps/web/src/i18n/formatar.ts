import { formatos, FUSO_PADRAO, IDIOMA_PADRAO } from './configuracao';

const DATA_CIVIL = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Data jurídica (`DataCivil`, AAAA-MM-DD) como DD/MM/AAAA. Sem conversão de fuso: a data civil
 * não é um instante, e convertê-la poderia exibir o dia anterior (ADR-013).
 */
export function formatarDataCivil(valor: string): string {
  const partes = DATA_CIVIL.exec(valor);
  if (partes === null) throw new RangeError(`Data civil inválida: ${valor}`);
  return `${partes[3] ?? ''}/${partes[2] ?? ''}/${partes[1] ?? ''}`;
}

/** Instante (ISO 8601 com fuso, vindo do servidor) no fuso de exibição. */
export function formatarInstante(valor: string, fuso: string = FUSO_PADRAO): string {
  const instante = new Date(valor);
  if (Number.isNaN(instante.getTime())) throw new RangeError(`Instante inválido: ${valor}`);
  return new Intl.DateTimeFormat(IDIOMA_PADRAO, {
    ...formatos.dateTime.dataHora,
    timeZone: fuso,
  }).format(instante);
}

/** Ano civil de um instante no fuso de exibição (ex.: o ano padrão dos filtros do calendário). */
export function anoNoFuso(instante: Date, fuso: string = FUSO_PADRAO): number {
  return Number(
    new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: fuso }).format(instante),
  );
}

/**
 * Data e hora digitadas (relógio de parede) no fuso informado, como instante ISO com `Z`. O
 * navegador não decide o fuso: o padrão é o de exibição (Brasília), o mesmo das telas.
 */
export function instanteDaDataHora(data: string, hora: string, fuso: string = FUSO_PADRAO): string {
  const d = DATA_CIVIL.exec(data);
  const h = /^(\d{2}):(\d{2})$/.exec(hora);
  if (d === null || h === null) throw new RangeError(`Data ou hora inválida: ${data} ${hora}`);
  const alvo = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(h[1]), Number(h[2]));
  // Diferença entre o relógio de parede no fuso e o UTC, no próprio instante (respeita horário de verão).
  const parede = (ms: number) => {
    const p: Record<string, string> = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: fuso,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
        .formatToParts(ms)
        .map((parte) => [parte.type, parte.value]),
    );
    const n = (campo: string) => Number(p[campo] ?? Number.NaN);
    return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'));
  };
  const primeira = alvo - (parede(alvo) - alvo);
  const ajustada = alvo - (parede(primeira) - primeira);
  return new Date(ajustada).toISOString();
}
