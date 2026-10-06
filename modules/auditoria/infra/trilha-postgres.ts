import { createHash } from 'node:crypto';

import { gerarUuidV7 } from '@pz/kernel';

import { EntradaDeAuditoria } from '../application/portas.js';
import { calcularHash, HASH_GENESE } from '../domain/cadeia.js';

import type { OrigemDaAuditoria, TrilhaDeAuditoria } from '../application/portas.js';
import type { RegistroDeAuditoria, RegistroEncadeado } from '../domain/cadeia.js';
import type { Transacao } from '@pz/db';

export const sha256 = (texto: string) => createHash('sha256').update(texto).digest('hex');

/**
 * Trilha no PostgreSQL (ADR-006). `pg_advisory_xact_lock` por tenant serializa a sequência
 * (a trava cai com a transação); o horário é o `now()` do banco, lido na própria transação.
 */
export class TrilhaPostgres implements TrilhaDeAuditoria<Transacao> {
  async registrar(
    tx: Transacao,
    entrada: EntradaDeAuditoria,
    origem: OrigemDaAuditoria,
  ): Promise<void> {
    const valida = EntradaDeAuditoria.parse(entrada);
    const [contexto] = await tx.$queryRaw<{ tenant: string | null; agora: Date }[]>`
      SELECT pz_tenant_atual()::text AS tenant, now() AS agora`;
    const tenantId = contexto?.tenant;
    if (tenantId === undefined || tenantId === null)
      throw new Error('Auditoria exige tenant na transação');
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`auditoria:${tenantId}`}, 0))`;
    const [ultimo] = await tx.$queryRaw<{ sequencia: bigint; hash: string }[]>`
      SELECT sequencia, hash FROM evento_auditoria
       WHERE tenant_id = ${tenantId}::uuid ORDER BY sequencia DESC LIMIT 1`;
    const registro: RegistroDeAuditoria = {
      id: gerarUuidV7(),
      tenantId,
      sequencia: Number(ultimo?.sequencia ?? 0n) + 1,
      tipo: valida.tipo,
      entidade: valida.entidade,
      entidadeId: valida.entidadeId,
      usuarioId: origem.usuarioId ?? null,
      usuarioRealId: origem.usuarioRealId ?? null,
      canal: origem.canal,
      ip: origem.ip ?? null,
      userAgent: origem.userAgent ?? null,
      antes: valida.antes ?? null,
      depois: valida.depois ?? null,
      criadoEm: (contexto?.agora ?? new Date(Number.NaN)).toISOString(),
    };
    const hashAnterior = ultimo?.hash ?? HASH_GENESE;
    const hash = calcularHash(hashAnterior, registro, sha256);
    await tx.$executeRaw`
      INSERT INTO evento_auditoria (id, tenant_id, sequencia, tipo, entidade, entidade_id, usuario_id,
        usuario_real_id, canal, ip, user_agent, antes, depois, criado_em, hash_anterior, hash)
      VALUES (${registro.id}::uuid, ${tenantId}::uuid, ${BigInt(registro.sequencia)}, ${registro.tipo},
        ${registro.entidade}, ${registro.entidadeId}, ${registro.usuarioId}::uuid, ${registro.usuarioRealId}::uuid,
        ${registro.canal}, ${registro.ip}, ${registro.userAgent}, ${JSON.stringify(registro.antes)}::jsonb,
        ${JSON.stringify(registro.depois)}::jsonb, ${contexto?.agora}, ${hashAnterior}, ${hash})`;
  }

  /** Trecho da cadeia do tenant, em ordem, a partir de uma sequência (filtro explícito: o verificador roda como sistema). */
  async lerCadeia(
    tx: Transacao,
    tenantId: string,
    desdeSequencia = 0,
    limite = 10_000,
  ): Promise<RegistroEncadeado[]> {
    const linhas = await tx.$queryRaw<
      {
        id: string;
        tenant_id: string;
        sequencia: bigint;
        tipo: string;
        entidade: string;
        entidade_id: string;
        usuario_id: string | null;
        usuario_real_id: string | null;
        canal: string;
        ip: string | null;
        user_agent: string | null;
        antes: unknown;
        depois: unknown;
        criado_em: Date;
        hash_anterior: string;
        hash: string;
      }[]
    >`SELECT * FROM evento_auditoria WHERE tenant_id = ${tenantId}::uuid AND sequencia > ${BigInt(desdeSequencia)}
       ORDER BY sequencia LIMIT ${limite}`;
    return linhas.map((l) => ({
      id: l.id,
      tenantId: l.tenant_id,
      sequencia: Number(l.sequencia),
      tipo: l.tipo,
      entidade: l.entidade,
      entidadeId: l.entidade_id,
      usuarioId: l.usuario_id,
      usuarioRealId: l.usuario_real_id,
      canal: l.canal,
      ip: l.ip,
      userAgent: l.user_agent,
      antes: l.antes,
      depois: l.depois,
      criadoEm: l.criado_em.toISOString(),
      hashAnterior: l.hash_anterior,
      hash: l.hash,
    }));
  }
}
