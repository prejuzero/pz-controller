import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PASTA_MIGRACOES, reverterUltimaMigracao } from './migracoes.js';

import type { Client } from 'pg';

function clienteFalso(ultima: string | undefined, falharNoDown = false) {
  const consultas: string[] = [];
  const cliente = {
    query: (sql: string) => {
      consultas.push(sql.trim().split(/\s+/).slice(0, 3).join(' '));
      if (sql.includes('FROM _prisma_migrations')) {
        return Promise.resolve({ rows: ultima === undefined ? [] : [{ migration_name: ultima }] });
      }
      if (falharNoDown && sql.includes('DROP TABLE')) return Promise.reject(new Error('falhou'));
      return Promise.resolve({ rows: [] });
    },
  } as unknown as Client;
  return { cliente, consultas };
}

async function pastaComMigracao(nome: string): Promise<string> {
  const pasta = await mkdtemp(join(tmpdir(), 'migracoes-'));
  await mkdir(join(pasta, nome));
  await writeFile(join(pasta, nome, 'down.sql'), 'DROP TABLE exemplo;');
  return pasta;
}

describe('reverterUltimaMigracao', () => {
  it('aponta para prisma/migrations do pacote', () => {
    expect(PASTA_MIGRACOES).toMatch(/packages[/\\]db[/\\]prisma[/\\]migrations$/);
  });

  it('sem migração aplicada, não faz nada', async () => {
    const { cliente, consultas } = clienteFalso(undefined);
    expect(await reverterUltimaMigracao(cliente)).toBeUndefined();
    expect(consultas).toHaveLength(1);
  });

  it('executa o down.sql e remove o registro na mesma transação', async () => {
    const pasta = await pastaComMigracao('20260101000000_exemplo');
    const { cliente, consultas } = clienteFalso('20260101000000_exemplo');

    expect(await reverterUltimaMigracao(cliente, pasta)).toBe('20260101000000_exemplo');
    expect(consultas.slice(1)).toEqual([
      'BEGIN',
      'DROP TABLE exemplo;',
      'DELETE FROM _prisma_migrations',
      'COMMIT',
    ]);
  });

  it('se o down.sql falhar, desfaz tudo e mantém o registro da migração', async () => {
    const pasta = await pastaComMigracao('20260101000000_exemplo');
    const { cliente, consultas } = clienteFalso('20260101000000_exemplo', true);

    await expect(reverterUltimaMigracao(cliente, pasta)).rejects.toThrow('falhou');
    expect(consultas.slice(1)).toEqual(['BEGIN', 'DROP TABLE exemplo;', 'ROLLBACK']);
  });
});
