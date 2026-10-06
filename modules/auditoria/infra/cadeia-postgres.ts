import { TrilhaPostgres } from './trilha-postgres.js';

import type { Checkpoint, RepositorioDaCadeia } from '../application/integridade.js';
import type { RegistroEncadeado } from '../domain/cadeia.js';
import type { Transacao } from '@pz/db';

/** Cadeia e checkpoint no PostgreSQL; sempre com o tenant explícito (roda como sistema). */
export class CadeiaPostgres implements RepositorioDaCadeia<Transacao> {
  readonly #trilha = new TrilhaPostgres();

  async tenants(tx: Transacao): Promise<string[]> {
    const linhas = await tx.$queryRaw<{ tenant_id: string }[]>`
      SELECT DISTINCT tenant_id::text FROM evento_auditoria ORDER BY 1`;
    return linhas.map((l) => l.tenant_id);
  }

  ler(
    tx: Transacao,
    tenantId: string,
    desde: number,
    limite: number,
  ): Promise<RegistroEncadeado[]> {
    return this.#trilha.lerCadeia(tx, tenantId, desde, limite);
  }

  async ultimaSequencia(tx: Transacao, tenantId: string): Promise<number> {
    const [linha] = await tx.$queryRaw<{ maxima: bigint | null }[]>`
      SELECT max(sequencia) AS maxima FROM evento_auditoria WHERE tenant_id = ${tenantId}::uuid`;
    return Number(linha?.maxima ?? 0n);
  }

  async checkpoint(tx: Transacao, tenantId: string): Promise<Checkpoint | undefined> {
    const linha = await tx.auditoriaVerificacao.findUnique({ where: { tenantId } });
    return linha === null
      ? undefined
      : {
          ultimaSequencia: Number(linha.ultimaSequencia),
          ultimoHash: linha.ultimoHash,
          ultimaExportada: Number(linha.ultimaExportada),
        };
  }

  async salvar(tx: Transacao, tenantId: string, c: Checkpoint): Promise<void> {
    const dados = {
      ultimaSequencia: BigInt(c.ultimaSequencia),
      ultimoHash: c.ultimoHash,
      ultimaExportada: BigInt(c.ultimaExportada),
    };
    // verificado_em: horário do banco (default now() na criação e now() na atualização).
    await tx.$executeRaw`
      INSERT INTO auditoria_verificacao (tenant_id, ultima_sequencia, ultimo_hash, ultima_exportada)
      VALUES (${tenantId}::uuid, ${dados.ultimaSequencia}, ${dados.ultimoHash}, ${dados.ultimaExportada})
      ON CONFLICT (tenant_id) DO UPDATE SET ultima_sequencia = EXCLUDED.ultima_sequencia,
        ultimo_hash = EXCLUDED.ultimo_hash, ultima_exportada = EXCLUDED.ultima_exportada, verificado_em = now()`;
  }
}
