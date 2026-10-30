import { LocalDate } from '@pz/kernel';

import type { Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

/** A publicação como chegou a um tenant (lida pelo módulo prazos, HU24). */
export interface DestinatarioLido {
  readonly processoId: Uuid | null;
  readonly oabId: Uuid | null;
  readonly dataDisponibilizacao: LocalDate;
}

/** Destinatários de um conteúdo (ADR-014): um por tenant. */
export class DestinatariosPostgres {
  /** No tenant da transação (RLS). */
  async doConteudo(tx: Transacao, conteudoId: Uuid): Promise<DestinatarioLido | undefined> {
    const l = await tx.publicacaoDestinatario.findFirst({
      where: { conteudoId },
      select: {
        processoId: true,
        oabId: true,
        conteudo: { select: { dataDisponibilizacao: true } },
      },
    });
    if (l === null) return undefined;
    const d = l.conteudo.dataDisponibilizacao;
    return {
      processoId: l.processoId as Uuid | null,
      oabId: l.oabId as Uuid | null,
      // Coluna DATE chega como meia-noite UTC.
      dataDisponibilizacao: LocalDate.de(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()),
    };
  }

  /** Como sistema (sem RLS): tenants que receberam o conteúdo. */
  async tenantsDoConteudo(tx: Transacao, conteudoId: Uuid): Promise<Uuid[]> {
    const linhas = await tx.publicacaoDestinatario.findMany({
      where: { conteudoId },
      select: { tenantId: true },
      orderBy: { tenantId: 'asc' },
    });
    return linhas.map((l) => l.tenantId as Uuid);
  }
}
