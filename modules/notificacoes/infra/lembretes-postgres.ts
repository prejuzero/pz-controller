import { Instant, LocalDate } from '@pz/kernel';

import type {
  DesfechoDoLembrete,
  LembreteAgendado,
  RepositorioDeLembretes,
} from '../application/lembretes.js';
import type { Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

const paraData = (d: LocalDate) => new Date(Date.UTC(d.ano, d.mes - 1, d.dia));

interface Linha {
  id: string;
  tenant_id: string;
  prazo_id: string;
  usuario_id: string;
  tipo: 'antecedencia' | 'insistencia';
  antecedencia: number;
  vencimento: Date;
  disparo_em: Date;
}

const lembrete = (l: Linha): LembreteAgendado => ({
  id: l.id as Uuid,
  tenantId: l.tenant_id as Uuid,
  prazoId: l.prazo_id as Uuid,
  usuarioId: l.usuario_id as Uuid,
  tipo: l.tipo,
  antecedencia: l.antecedencia,
  vencimento: LocalDate.de(
    l.vencimento.getUTCFullYear(),
    l.vencimento.getUTCMonth() + 1,
    l.vencimento.getUTCDate(),
  ),
  disparoEm: Instant.deEpochMs(l.disparo_em.getTime()),
});

/** Agenda dos lembretes no PostgreSQL (HU31), no tenant da transação (RLS). Sem DELETE. */
export class LembretesPostgres implements RepositorioDeLembretes<Transacao> {
  async substituir(
    tx: Transacao,
    prazoId: Uuid,
    novos: readonly LembreteAgendado[],
    agora: Instant,
  ): Promise<void> {
    await this.cancelarDoPrazo(tx, prazoId, agora);
    if (novos.length === 0) return;
    await tx.lembreteAgendado.createMany({
      data: novos.map((l) => ({
        id: l.id,
        tenantId: l.tenantId,
        prazoId: l.prazoId,
        usuarioId: l.usuarioId,
        tipo: l.tipo,
        antecedencia: l.antecedencia,
        vencimento: paraData(l.vencimento),
        disparoEm: new Date(l.disparoEm.epochMs),
      })),
      // Reprogramação concorrente do mesmo prazo: o índice único parcial barra o repetido.
      skipDuplicates: true,
    });
  }

  async cancelarDoPrazo(tx: Transacao, prazoId: Uuid, agora: Instant): Promise<number> {
    const { count } = await tx.lembreteAgendado.updateMany({
      where: { prazoId, situacao: 'agendado' },
      data: { situacao: 'cancelado', processadoEm: new Date(agora.epochMs) },
    });
    return count;
  }

  async tenantsComDevidos(tx: Transacao, agora: Instant): Promise<Uuid[]> {
    const linhas = await tx.lembreteAgendado.findMany({
      where: { situacao: 'agendado', disparoEm: { lte: new Date(agora.epochMs) } },
      distinct: ['tenantId'],
      select: { tenantId: true },
      orderBy: { tenantId: 'asc' },
    });
    return linhas.map((l) => l.tenantId as Uuid);
  }

  async devidos(tx: Transacao, agora: Instant, limite: number): Promise<LembreteAgendado[]> {
    // SKIP LOCKED: outra réplica no mesmo lote pula as linhas já travadas por esta transação.
    const linhas = await tx.$queryRaw<Linha[]>`
      SELECT id, tenant_id, prazo_id, usuario_id, tipo, antecedencia, vencimento, disparo_em
        FROM lembrete_agendado
       WHERE situacao = 'agendado' AND disparo_em <= ${new Date(agora.epochMs)}
       ORDER BY disparo_em, id
       LIMIT ${limite}
         FOR UPDATE SKIP LOCKED`;
    return linhas.map(lembrete);
  }

  async marcar(
    tx: Transacao,
    id: Uuid,
    desfecho: DesfechoDoLembrete,
    agora: Instant,
  ): Promise<void> {
    await tx.lembreteAgendado.update({
      where: { id },
      data: { situacao: desfecho, processadoEm: new Date(agora.epochMs) },
    });
  }

  async prazosDoUsuario(tx: Transacao, usuarioId: Uuid): Promise<Uuid[]> {
    const linhas = await tx.lembreteAgendado.findMany({
      where: { usuarioId, situacao: 'agendado' },
      distinct: ['prazoId'],
      select: { prazoId: true },
    });
    return linhas.map((l) => l.prazoId as Uuid);
  }
}
