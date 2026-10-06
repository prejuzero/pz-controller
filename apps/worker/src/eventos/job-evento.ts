import { EVENTOS } from '@pz/contracts';
import { Instant } from '@pz/kernel';
import { UnrecoverableError } from 'bullmq';
import { z } from 'zod';

import { definirJob } from '../filas/job.js';

import type { EventoDominio, Uuid } from '@pz/kernel';

/** Evento como trafega na fila (JSON): instantes em ISO 8601. */
export const EventoSerializado = z.object({
  id: z.uuid(),
  tipo: z.string().min(1),
  versao: z.number().int().positive(),
  tenantId: z.uuid(),
  agregadoId: z.string().min(1),
  ocorridoEm: z.iso.datetime({ offset: true }),
  payload: z.unknown(),
});
export type EventoSerializado = z.infer<typeof EventoSerializado>;

/**
 * Um job por (consumidor, evento) na fila `eventos` (ADR-004): cada consumidor falha, tenta de
 * novo e vai para a DLQ de forma independente dos outros.
 */
export const consumirEvento = definirJob({
  fila: 'eventos',
  tipo: 'eventos.consumir',
  dados: z.object({ consumidor: z.string().min(1), evento: EventoSerializado }),
});

export function serializarEvento(evento: EventoDominio): EventoSerializado {
  return {
    id: evento.id,
    tipo: evento.tipo,
    versao: evento.versao,
    tenantId: evento.tenantId,
    agregadoId: evento.agregadoId,
    ocorridoEm: evento.ocorridoEm.paraIso(),
    payload: evento.payload,
  };
}

/**
 * Reconstrói o evento validando-o contra o contrato publicado em @pz/contracts (tipo + versão).
 * Evento sem contrato ou fora do schema não tem retentativa: vai direto para a DLQ.
 */
export function desserializarEvento(serializado: EventoSerializado): EventoDominio {
  const contrato = EVENTOS.find(
    (item) => item.tipo === serializado.tipo && item.versao === serializado.versao,
  );
  if (contrato === undefined) {
    throw new UnrecoverableError(
      `evento ${serializado.tipo} v${String(serializado.versao)} sem contrato em @pz/contracts`,
    );
  }
  const validado = contrato.envelope.safeParse(serializado);
  if (!validado.success) {
    throw new UnrecoverableError(`evento ${serializado.tipo} fora do contrato`);
  }
  return {
    id: serializado.id as Uuid,
    tipo: serializado.tipo,
    versao: serializado.versao,
    tenantId: serializado.tenantId as Uuid,
    agregadoId: serializado.agregadoId,
    ocorridoEm: Instant.deIso(serializado.ocorridoEm),
    payload: validado.data.payload,
  };
}
