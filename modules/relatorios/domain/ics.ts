import type { Instant, LocalDate } from '@pz/kernel';

/** Evento de dia inteiro (HU50): a data vem pronta (o vencimento do motor); nada é calculado. */
export interface EventoDeAgenda {
  readonly uid: string;
  readonly data: LocalDate;
  readonly titulo: string;
  readonly descricao: string;
  readonly url: string | null;
}

export interface CalendarioIcs {
  readonly nome: string;
  readonly geradoEm: Instant;
  readonly eventos: readonly EventoDeAgenda[];
}

const LIMITE_DE_OCTETOS = 75;
const utf8 = new TextEncoder();

/** TEXT do RFC 5545 (3.3.11): barra, ponto e vírgula, vírgula e quebra de linha escapados. */
export function escaparTexto(texto: string): string {
  return texto
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Dobra a linha em até 75 octetos (RFC 5545, 3.1): as continuações começam com espaço. Corta
 * entre caracteres, nunca no meio de um caractere UTF-8.
 */
function dobrar(linha: string): string {
  const partes: string[] = [];
  let atual = '';
  let octetos = 0;
  for (const c of linha) {
    const tamanho = utf8.encode(c).length;
    const limite = partes.length === 0 ? LIMITE_DE_OCTETOS : LIMITE_DE_OCTETOS - 1;
    if (octetos + tamanho > limite) {
      partes.push(atual);
      atual = '';
      octetos = 0;
    }
    atual += c;
    octetos += tamanho;
  }
  partes.push(atual);
  return partes.join('\r\n ');
}

const dataIcs = (d: LocalDate) => d.paraIso().replace(/-/g, '');
const instanteIcs = (i: Instant) =>
  i
    .paraIso()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

/** Calendário iCalendar (RFC 5545) com eventos de dia inteiro, em CRLF. */
export function gerarIcs(calendario: CalendarioIcs): string {
  const linhas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PrejuZero//Agenda de prazos//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escaparTexto(calendario.nome)}`,
    ...calendario.eventos.flatMap((e) => [
      'BEGIN:VEVENT',
      `UID:${escaparTexto(e.uid)}`,
      `DTSTAMP:${instanteIcs(calendario.geradoEm)}`,
      // Dia inteiro sem DTEND: dura o próprio dia (RFC 5545, 3.6.1).
      `DTSTART;VALUE=DATE:${dataIcs(e.data)}`,
      `SUMMARY:${escaparTexto(e.titulo)}`,
      ...(e.descricao === '' ? [] : [`DESCRIPTION:${escaparTexto(e.descricao)}`]),
      ...(e.url === null ? [] : [`URL:${e.url}`]),
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
  ];
  return `${linhas.map(dobrar).join('\r\n')}\r\n`;
}
