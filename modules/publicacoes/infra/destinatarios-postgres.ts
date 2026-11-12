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
  /**
   * No tenant da transação (RLS), pela view `publicacao_do_tenant`: a aplicação não lê
   * `publicacao_conteudo` diretamente (ADR-014; migração 20261025000000_publicacoes).
   */
  async doConteudo(tx: Transacao, conteudoId: Uuid): Promise<DestinatarioLido | undefined> {
    const [l] = await tx.$queryRaw<
      { processo_id: string | null; oab_id: string | null; data_disponibilizacao: Date }[]
    >`
      SELECT processo_id, oab_id, data_disponibilizacao
        FROM publicacao_do_tenant
       WHERE conteudo_id = ${conteudoId}::uuid
       LIMIT 1`;
    if (l === undefined) return undefined;
    const d = l.data_disponibilizacao;
    return {
      processoId: l.processo_id as Uuid | null,
      oabId: l.oab_id as Uuid | null,
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
