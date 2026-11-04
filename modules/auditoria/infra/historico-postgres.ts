import { paraRegistro } from './trilha-postgres.js';

import type { LinhaDaTrilha } from './trilha-postgres.js';
import type {
  AlvoDoHistorico,
  RepositorioDoHistorico,
  Verificacao,
} from '../application/historico.js';
import type { RegistroEncadeado } from '../domain/cadeia.js';
import type { Transacao } from '@pz/db';

/** Histórico e emissões verificáveis (HU35) no PostgreSQL, no tenant da transação (RLS). */
export class HistoricoPostgres implements RepositorioDoHistorico<Transacao> {
  async porEntidades(
    tx: Transacao,
    tenantId: string,
    alvos: readonly AlvoDoHistorico[],
    limite: number,
  ): Promise<RegistroEncadeado[]> {
    if (alvos.length === 0) return [];
    // Índice evento_auditoria_entidade_idx (tenant, entidade, entidade_id); pares por unnest.
    const linhas = await tx.$queryRaw<LinhaDaTrilha[]>`
      SELECT * FROM evento_auditoria WHERE tenant_id = ${tenantId}::uuid
        AND (entidade, entidade_id) IN (
          SELECT * FROM unnest(${alvos.map((a) => a.entidade)}::text[], ${alvos.map((a) => a.entidadeId)}::text[]))
      ORDER BY sequencia LIMIT ${limite}`;
    return linhas.map(paraRegistro);
  }

  async porSequencias(
    tx: Transacao,
    tenantId: string,
    sequencias: readonly number[],
  ): Promise<RegistroEncadeado[]> {
    if (sequencias.length === 0) return [];
    const linhas = await tx.$queryRaw<LinhaDaTrilha[]>`
      SELECT * FROM evento_auditoria WHERE tenant_id = ${tenantId}::uuid
        AND sequencia = ANY(${sequencias.map((s) => BigInt(s))}::bigint[])
      ORDER BY sequencia`;
    return linhas.map(paraRegistro);
  }

  async gravarVerificacao(tx: Transacao, v: Verificacao): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO verificacao_historico (codigo, tenant_id, entidade, entidade_id, sequencias)
      VALUES (${v.codigo}, ${v.tenantId}::uuid, ${v.entidade}, ${v.entidadeId},
        ${v.sequencias.map((s) => BigInt(s))}::bigint[])
      ON CONFLICT (codigo) DO NOTHING`;
  }

  async verificacao(
    tx: Transacao,
    codigo: string,
  ): Promise<(Verificacao & { emitidaEm: string }) | undefined> {
    const [l] = await tx.$queryRaw<
      {
        codigo: string;
        tenant_id: string;
        entidade: string;
        entidade_id: string;
        sequencias: bigint[];
        emitida_em: Date;
      }[]
    >`SELECT codigo, tenant_id::text, entidade, entidade_id, sequencias, emitida_em
        FROM verificacao_historico WHERE codigo = ${codigo}`;
    return l === undefined
      ? undefined
      : {
          codigo: l.codigo,
          tenantId: l.tenant_id,
          entidade: l.entidade,
          entidadeId: l.entidade_id,
          sequencias: l.sequencias.map(Number),
          emitidaEm: l.emitida_em.toISOString(),
        };
  }
}
