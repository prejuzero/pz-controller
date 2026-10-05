import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Client } from 'pg';

/** Pasta das migrações versionadas (prisma/migrations). */
export const PASTA_MIGRACOES = fileURLToPath(new URL('../prisma/migrations', import.meta.url));

/**
 * Reverte a última migração aplicada (o Prisma Migrate só aplica): executa o `down.sql` da
 * pasta da migração e remove o registro em `_prisma_migrations`, na mesma transação.
 * Devolve o nome da migração revertida, ou `undefined` se não havia nenhuma.
 */
export async function reverterUltimaMigracao(
  cliente: Client,
  pasta: string = PASTA_MIGRACOES,
): Promise<string | undefined> {
  const { rows } = await cliente.query<{ migration_name: string }>(
    `SELECT migration_name FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      ORDER BY finished_at DESC, migration_name DESC LIMIT 1`,
  );
  const nome = rows[0]?.migration_name;
  if (nome === undefined) return undefined;

  const reversao = await readFile(join(pasta, nome, 'down.sql'), 'utf8');
  await cliente.query('BEGIN');
  try {
    await cliente.query(reversao);
    await cliente.query('DELETE FROM _prisma_migrations WHERE migration_name = $1', [nome]);
    await cliente.query('COMMIT');
  } catch (erro) {
    await cliente.query('ROLLBACK');
    throw erro;
  }
  return nome;
}
