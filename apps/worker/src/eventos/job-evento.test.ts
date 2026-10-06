import { FixedClock, gerarUuidV7, Instant } from '@pz/kernel';
import { UnrecoverableError } from 'bullmq';
import { describe, expect, it } from 'vitest';

import { consumirEvento, desserializarEvento, serializarEvento } from './job-evento.js';

import type { EventoDominio } from '@pz/kernel';

const relogio = new FixedClock(Instant.deIso('2026-10-05T12:00:00Z'));
const evento: EventoDominio = {
  id: gerarUuidV7(relogio),
  tipo: 'SituacaoVerificada',
  versao: 1,
  tenantId: gerarUuidV7(relogio),
  agregadoId: 'verificacao-1',
  ocorridoEm: relogio.agora(),
  payload: { situacao: 'operacional' },
};

describe('evento na fila', () => {
  it('serializa e desserializa validando contra o contrato', () => {
    const serializado = serializarEvento(evento);
    expect(serializado.ocorridoEm).toBe('2026-10-05T12:00:00.000Z');
    expect(
      consumirEvento.dados.parse({ consumidor: 'X.tratar', evento: serializado }),
    ).toBeTruthy();

    const reconstruido = desserializarEvento(serializado);
    expect(reconstruido).toEqual(evento);
    expect(reconstruido.ocorridoEm.igual(evento.ocorridoEm)).toBe(true);
  });

  it('evento sem contrato ou fora do schema vai para a DLQ (sem retentativa)', () => {
    const serializado = serializarEvento(evento);
    expect(() => desserializarEvento({ ...serializado, tipo: 'SemContrato' })).toThrow(
      UnrecoverableError,
    );
    expect(() => desserializarEvento({ ...serializado, versao: 2 })).toThrow('sem contrato');
    expect(() =>
      desserializarEvento({ ...serializado, payload: { situacao: 'quebrada' } }),
    ).toThrow('fora do contrato');
  });

  it('o job de consumo fica na fila eventos', () => {
    expect(consumirEvento).toMatchObject({
      fila: 'eventos',
      tipo: 'eventos.consumir',
      global: false,
    });
  });
});
