import { Instant } from '@pz/kernel';
import { capturarContextoPropagavel } from '@pz/observability';

import type { Transacao } from './banco.js';
import type { Prisma } from './gerado/prisma/client.js';
import type {
  EventoDominio,
  FilaDoRelay,
  LimpezaDoOutbox,
  Outbox,
  RegistroDeProcessamento,
  Uuid,
} from '@pz/kernel';
import type { ContextoPropagavel } from '@pz/observability';

interface LinhaEvento {
  id: string;
  tipo: string;
  versao: number;
  tenant_id: string;
  agregado_id: string;
  payload: unknown;
  contexto: ContextoPropagavel | null;
  ocorrido_em: Date;
}

/** Evento reservado pelo relay, com o contexto de trace gravado junto dele. */
export interface EventoReservado {
  readonly evento: EventoDominio;
  readonly contexto: ContextoPropagavel;
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
 *   com `FOR UPDATE SKIP LOCKED` para relays concorrentes não pegarem o mesmo evento;
 * - `removerPublicadosAntesDe`/`removerProcessadosAntesDe`: limpeza agendada, também como sistema.
 */
export class OutboxPostgres
  implements
    Outbox<Transacao>,
    RegistroDeProcessamento<Transacao>,
    FilaDoRelay<Transacao>,
    LimpezaDoOutbox<Transacao>
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
    return (await this.reservarPendentesComContexto(transacao, limite)).map((item) => item.evento);
  }

  /** Como `reservarPendentes`, devolvendo também o contexto de trace de cada evento. */
  async reservarPendentesComContexto(
    transacao: Transacao,
    limite: number,
  ): Promise<readonly EventoReservado[]> {
    const linhas = await transacao.$queryRaw<LinhaEvento[]>`
      SELECT id, tipo, versao, tenant_id, agregado_id, payload, contexto, ocorrido_em
        FROM evento_dominio
       WHERE publicado_em IS NULL
       ORDER BY criado_em, id
       LIMIT ${limite}
       FOR UPDATE SKIP LOCKED`;
    return linhas.map((linha) => ({ evento: paraEvento(linha), contexto: linha.contexto ?? {} }));
  }

  async marcarPublicados(transacao: Transacao, ids: readonly Uuid[], em: Instant): Promise<void> {
    await transacao.eventoDominio.updateMany({
      where: { id: { in: [...ids] } },
      data: { publicadoEm: new Date(em.epochMs) },
    });
  }

  async removerPublicadosAntesDe(
    transacao: Transacao,
    limite: Instant,
    lote: number,
  ): Promise<number> {
    // Só publicados: um pendente antigo é falha do relay (alerta), nunca lixo a apagar.
    return transacao.$executeRaw`
      DELETE FROM evento_dominio
       WHERE id IN (SELECT id FROM evento_dominio
                     WHERE publicado_em IS NOT NULL AND publicado_em < ${new Date(limite.epochMs)}
                     ORDER BY publicado_em
                     LIMIT ${lote}
                     FOR UPDATE SKIP LOCKED)`;
  }

  async removerProcessadosAntesDe(
    transacao: Transacao,
    limite: Instant,
    lote: number,
  ): Promise<number> {
    return transacao.$executeRaw`
      DELETE FROM evento_processado
       WHERE (consumidor, evento_id) IN (
              SELECT consumidor, evento_id FROM evento_processado
               WHERE processado_em < ${new Date(limite.epochMs)}
               ORDER BY processado_em
               LIMIT ${lote}
               FOR UPDATE SKIP LOCKED)`;
  }
}
