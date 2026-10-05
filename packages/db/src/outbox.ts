import { Instant } from '@pz/kernel';
import { capturarContextoPropagavel } from '@pz/observability';

import type { Transacao } from './banco.js';
import type { Prisma } from './gerado/prisma/client.js';
import type { EventoDominio, FilaDoRelay, Outbox, RegistroDeProcessamento, Uuid } from '@pz/kernel';

interface LinhaEvento {
  id: string;
  tipo: string;
  versao: number;
  tenant_id: string;
  agregado_id: string;
  payload: unknown;
  ocorrido_em: Date;
}

function paraEvento(linha: LinhaEvento): EventoDominio {
  return {
    id: linha.id as Uuid,
    tipo: linha.tipo,
    versao: linha.versao,
    tenantId: linha.tenant_id as Uuid,
    agregadoId: linha.agregado_id,
    ocorridoEm: Instant.deEpochMs(linha.ocorrido_em.getTime()),
    payload: linha.payload,
  };
}

/**
 * Outbox transacional no PostgreSQL (ADR-004), implementando as portas do kernel:
 * - `gravar`: na transação do caso de uso (pz_app, tenant da transação), com o contexto de trace;
 * - `registrarSeNovo`: deduplicação por consumidor em `evento_processado`, no tenant da transação;
 * - `reservarPendentes`/`marcarPublicados`: usados pelo relay como sistema (atravessa tenants),
 *   com `FOR UPDATE SKIP LOCKED` para relays concorrentes não pegarem o mesmo evento.
 */
export class OutboxPostgres
  implements Outbox<Transacao>, RegistroDeProcessamento<Transacao>, FilaDoRelay<Transacao>
{
  async gravar(transacao: Transacao, eventos: readonly EventoDominio[]): Promise<void> {
    if (eventos.length === 0) return;
    const contexto = capturarContextoPropagavel();
    await transacao.eventoDominio.createMany({
      data: eventos.map((evento) => ({
        id: evento.id,
        tipo: evento.tipo,
        versao: evento.versao,
        tenantId: evento.tenantId,
        agregadoId: evento.agregadoId,
        payload: evento.payload as Prisma.InputJsonValue,
        contexto: contexto as Prisma.InputJsonValue,
        ocorridoEm: new Date(evento.ocorridoEm.epochMs),
      })),
    });
  }

  async registrarSeNovo(
    transacao: Transacao,
    consumidor: string,
    eventoId: Uuid,
  ): Promise<boolean> {
    // Se outra transação estiver inserindo a mesma chave, o PostgreSQL espera ela terminar:
    // confirmada, esta vê o conflito e não processa; revertida, esta processa.
    const inseridos = await transacao.$executeRaw`
      INSERT INTO evento_processado (consumidor, evento_id, tenant_id)
      VALUES (${consumidor}, ${eventoId}::uuid, pz_tenant_atual())
      ON CONFLICT (consumidor, evento_id) DO NOTHING`;
    return inseridos === 1;
  }

  async reservarPendentes(transacao: Transacao, limite: number): Promise<readonly EventoDominio[]> {
    const linhas = await transacao.$queryRaw<LinhaEvento[]>`
      SELECT id, tipo, versao, tenant_id, agregado_id, payload, ocorrido_em
        FROM evento_dominio
       WHERE publicado_em IS NULL
       ORDER BY criado_em, id
       LIMIT ${limite}
       FOR UPDATE SKIP LOCKED`;
    return linhas.map(paraEvento);
  }

  async marcarPublicados(transacao: Transacao, ids: readonly Uuid[], em: Instant): Promise<void> {
    await transacao.eventoDominio.updateMany({
      where: { id: { in: [...ids] } },
      data: { publicadoEm: new Date(em.epochMs) },
    });
  }
}
