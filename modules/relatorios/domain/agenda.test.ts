import { LocalDate } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { eventoDoPrazo } from './agenda.js';

const data = (iso: string) => {
  const r = LocalDate.analisar(iso);
  if (!r.ok) throw r.erro;
  return r.valor;
};
// Prazo FICTÍCIO.
const prazo = {
  id: '01a10e00-0000-7000-8000-0000000000a1',
  vencimento: data('2027-03-24'),
  status: 'a-confirmar' as const,
  nomeDoAto: 'Contestação',
  numeroCnj: '0000001-68.2026.8.26.0100',
  sigiloso: false,
};
const PORTAL = 'https://portal.exemplo.invalid';

describe('evento de prazo na agenda (HU50; decisão do usuário em 09/11/2026)', () => {
  it('mínimo: ato, situação, número do processo e link; avisa que a data exige confirmação', () => {
    expect(eventoDoPrazo(prazo, PORTAL)).toEqual({
      uid: `${prazo.id}@prejuzero`,
      data: prazo.vencimento,
      titulo: 'Prazo: Contestação (a confirmar) · 0000001-68.2026.8.26.0100',
      descricao:
        'Vence em 24/03/2027 (24h no horário do juízo). Data sugerida pelo motor de prazos do PrejuZero: só vale depois de confirmada no portal.',
      url: `${PORTAL}/prazos/${prazo.id}`,
    });
    expect(eventoDoPrazo({ ...prazo, status: 'pendente' }, PORTAL).titulo).toBe(
      'Prazo: Contestação · 0000001-68.2026.8.26.0100',
    );
    expect(eventoDoPrazo({ ...prazo, status: 'pendente' }, PORTAL).descricao).toBe(
      'Vence em 24/03/2027 (24h no horário do juízo).',
    );
  });

  it('processo sigiloso: nem ato nem número', () => {
    const e = eventoDoPrazo({ ...prazo, sigiloso: true }, `${PORTAL}/`);
    expect(e.titulo).toBe('Prazo (processo sigiloso)');
    expect(e.url).toBe(`${PORTAL}/prazos/${prazo.id}`);
  });
});
