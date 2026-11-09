import { Instant, LocalDate } from '@pz/kernel';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { escaparTexto, gerarIcs } from './ics.js';

const geradoEm = Instant.deIso('2026-11-09T12:00:00Z');
const data = (iso: string) => {
  const r = LocalDate.analisar(iso);
  if (!r.ok) throw r.erro;
  return r.valor;
};

describe('calendário .ics (HU50, RFC 5545)', () => {
  it('evento de dia inteiro no vencimento, com CRLF, UID estável e textos escapados', () => {
    const ics = gerarIcs({
      nome: 'PrejuZero · prazos',
      geradoEm,
      eventos: [
        {
          uid: 'p1@prejuzero',
          data: data('2027-03-24'),
          titulo: 'Prazo: contestação (a confirmar)',
          descricao: 'Linha 1\nLinha 2; com vírgula, e barra \\',
          url: 'https://portal.exemplo.invalid/prazos/p1',
        },
      ],
    });
    const linhas = ics.split('\r\n');
    expect(linhas[0]).toBe('BEGIN:VCALENDAR');
    expect(linhas).toContain('VERSION:2.0');
    expect(linhas).toContain('X-WR-CALNAME:PrejuZero · prazos');
    expect(linhas).toContain('UID:p1@prejuzero');
    expect(linhas).toContain('DTSTAMP:20261109T120000Z');
    // Dia inteiro sem DTEND: dura um dia (RFC 5545, 3.6.1); nenhuma data é calculada aqui.
    expect(linhas).toContain('DTSTART;VALUE=DATE:20270324');
    expect(ics).not.toContain('DTEND');
    expect(linhas).toContain('SUMMARY:Prazo: contestação (a confirmar)');
    expect(linhas).toContain('DESCRIPTION:Linha 1\\nLinha 2\\; com vírgula\\, e barra \\\\');
    expect(linhas).toContain('URL:https://portal.exemplo.invalid/prazos/p1');
    expect(linhas.at(-2)).toBe('END:VCALENDAR');
    expect(ics.endsWith('\r\n')).toBe(true);
  });

  it('sem eventos: calendário vazio válido', () => {
    const ics = gerarIcs({ nome: 'Vazio', geradoEm, eventos: [] });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('propriedade: nenhuma linha passa de 75 octetos e desdobrar devolve o texto', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 400 }), (texto) => {
        const ics = gerarIcs({
          nome: 'N',
          geradoEm,
          eventos: [
            { uid: 'u', data: data('2027-01-02'), titulo: texto, descricao: '', url: null },
          ],
        });
        for (const linha of ics.split('\r\n')) {
          expect(Buffer.byteLength(linha, 'utf8')).toBeLessThanOrEqual(75);
        }
        const desdobrado = ics.replace(/\r\n /g, '');
        expect(desdobrado).toContain(`SUMMARY:${escaparTexto(texto)}\r\n`);
      }),
    );
  });
});
