import { createHash, randomBytes } from 'node:crypto';

import { gerarUuidV7 } from '@pz/kernel';

import { EntradaDeAuditoria } from '../application/portas.js';
import { calcularHash, HASH_GENESE } from '../domain/cadeia.js';
import { substituirDadosPessoais } from '../domain/dados-pessoais.js';

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
    // ADR-018: IP, navegador e valores marcados vão para auditoria_dado_pessoal; o evento (e o
    // hash) leva só as referências, e o valor pode ser pseudonimizado sem quebrar a cadeia.
    const pessoais: { id: string; campo: string; valor: string }[] = [];
    const guardar = (campo: string, valor: string) => {
      const id = gerarUuidV7();
      pessoais.push({ id, campo, valor });
      return id;
    };
    const referencias: Record<string, string> = {};
    if (origem.ip !== undefined) referencias.ip = guardar('ip', origem.ip);
    if (origem.userAgent !== undefined)
      referencias.userAgent = guardar('userAgent', origem.userAgent);
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
      ip: null,
      userAgent: null,
      antes: substituirDadosPessoais(valida.antes ?? null, (v) => guardar('antes', v)),
      depois: substituirDadosPessoais(valida.depois ?? null, (v) => guardar('depois', v)),
      ...(Object.keys(referencias).length === 0 ? {} : { dadosPessoais: referencias }),
      criadoEm: (contexto?.agora ?? new Date(Number.NaN)).toISOString(),
    };
    for (const { id, campo, valor } of pessoais) {
      const sal = randomBytes(16).toString('hex');
      await tx.$executeRaw`
        INSERT INTO auditoria_dado_pessoal (id, tenant_id, usuario_id, campo, valor, sal, compromisso)
        VALUES (${id}::uuid, ${tenantId}::uuid, ${registro.usuarioId}::uuid, ${campo}, ${valor}, ${sal},
          ${sha256(sal + valor)})`;
    }
    const hashAnterior = ultimo?.hash ?? HASH_GENESE;
    const hash = calcularHash(hashAnterior, registro, sha256);
    await tx.$executeRaw`
      INSERT INTO evento_auditoria (id, tenant_id, sequencia, tipo, entidade, entidade_id, usuario_id,
        usuario_real_id, canal, ip, user_agent, antes, depois, dados_pessoais, criado_em, hash_anterior, hash)
      VALUES (${registro.id}::uuid, ${tenantId}::uuid, ${BigInt(registro.sequencia)}, ${registro.tipo},
        ${registro.entidade}, ${registro.entidadeId}, ${registro.usuarioId}::uuid, ${registro.usuarioRealId}::uuid,
        ${registro.canal}, ${registro.ip}, ${registro.userAgent}, ${JSON.stringify(registro.antes)}::jsonb,
        ${JSON.stringify(registro.depois)}::jsonb,
        ${registro.dadosPessoais === undefined ? null : JSON.stringify(registro.dadosPessoais)}::jsonb,
        ${contexto?.agora}, ${hashAnterior}, ${hash})`;
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
        dados_pessoais: Record<string, string> | null;
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
      ...(l.dados_pessoais === null ? {} : { dadosPessoais: l.dados_pessoais }),
      criadoEm: l.criado_em.toISOString(),
      hashAnterior: l.hash_anterior,
      hash: l.hash,
    }));
  }
}

/**
 * Pseudonimização dos dados pessoais da trilha (ADR-018, LGPD): apaga valor e sal; o
 * compromisso e as referências no evento ficam, e a cadeia continua válida. Roda como sistema.
 */
export class DadosPessoaisDaTrilhaPostgres {
  async pseudonimizar(tx: Transacao, tenantId: string, usuarioId?: string): Promise<number> {
    return usuarioId === undefined
      ? tx.$executeRaw`
          UPDATE auditoria_dado_pessoal SET valor = NULL, sal = NULL, pseudonimizado_em = now()
           WHERE tenant_id = ${tenantId}::uuid AND pseudonimizado_em IS NULL`
      : tx.$executeRaw`
          UPDATE auditoria_dado_pessoal SET valor = NULL, sal = NULL, pseudonimizado_em = now()
           WHERE tenant_id = ${tenantId}::uuid AND usuario_id = ${usuarioId}::uuid
             AND pseudonimizado_em IS NULL`;
  }
}
