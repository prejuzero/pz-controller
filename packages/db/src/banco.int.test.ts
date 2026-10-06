import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { reverterUltimaMigracao } from './migracoes.js';
import { subirBancoDeTeste } from './teste/postgres.js';

import type { BancoDeTeste } from './teste/postgres.js';
import type pg from 'pg';

// Dados fictícios: tenants e usuários de teste, sem relação com clientes reais.
const TENANT_A = '01a10e00-0000-7000-8000-00000000000a';
const TENANT_B = '01a10e00-0000-7000-8000-00000000000b';
const USUARIO_A = '01a10e00-0000-7000-8000-0000000000a1';
const USUARIO_B = '01a10e00-0000-7000-8000-0000000000b1';

let banco: BancoDeTeste;

beforeAll(async () => {
  banco = await subirBancoDeTeste();
  await banco.migrar();
}, 300_000);

afterAll(async () => {
  await banco.parar();
});

/** Executa `trabalho` numa transação com o tenant definido, como a aplicação fará (HU05). */
async function comoTenant<T>(
  cliente: pg.Client,
  tenant: string | undefined,
  trabalho: () => Promise<T>,
) {
  await cliente.query('BEGIN');
  try {
    if (tenant !== undefined)
      await cliente.query("SELECT set_config('app.tenant_id', $1, true)", [tenant]);
    return await trabalho();
  } finally {
    await cliente.query('ROLLBACK');
  }
}

describe('migrações', () => {
  it('sobem, descem e sobem de novo (reversíveis)', async () => {
    const migrador = await banco.conectar('pz_migrator');
    try {
      const tabelas = async () =>
        (
          await migrador.query<{ tablename: string }>(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY 1",
          )
        ).rows.map((linha) => linha.tablename);

      expect(await tabelas()).toEqual([
        'acesso',
        'evento_dominio',
        'evento_processado',
        'tenant',
        'usuario',
        'webhook_recebido',
      ]);

      while ((await reverterUltimaMigracao(migrador)) !== undefined) {
        // reverte até não sobrar nenhuma
      }
      expect(await tabelas()).toEqual([]);
      expect(await reverterUltimaMigracao(migrador)).toBeUndefined();

      await banco.migrar();
      expect(await tabelas()).toEqual([
        'acesso',
        'evento_dominio',
        'evento_processado',
        'tenant',
        'usuario',
        'webhook_recebido',
      ]);
    } finally {
      await migrador.end();
    }
  }, 120_000);
});

describe('RLS (ADR-003)', () => {
  it('toda tabela com tenant_id tem RLS ligado, forçado e política (tabela nova sem RLS falha aqui)', async () => {
    const migrador = await banco.conectar('pz_migrator');
    try {
      const { rows } = await migrador.query<{
        tabela: string;
        ativo: boolean;
        forcado: boolean;
        politicas: number;
      }>(`
        SELECT c.relname AS tabela, c.relrowsecurity AS ativo, c.relforcerowsecurity AS forcado,
               (SELECT count(*)::int FROM pg_policies p WHERE p.tablename = c.relname) AS politicas
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
         WHERE c.relkind IN ('r', 'p')
           AND (c.relname = 'tenant' OR EXISTS (
                 SELECT 1 FROM information_schema.columns col
                  WHERE col.table_schema = 'public' AND col.table_name = c.relname
                    AND col.column_name = 'tenant_id'))
         ORDER BY 1`);

      expect(rows.map((linha) => linha.tabela)).toEqual([
        'acesso',
        'evento_dominio',
        'evento_processado',
        'tenant',
        'usuario',
      ]);
      for (const linha of rows) {
        expect(linha, linha.tabela).toMatchObject({ ativo: true, forcado: true });
        expect(linha.politicas, linha.tabela).toBeGreaterThan(0);
      }
    } finally {
      await migrador.end();
    }
  });

  it('a aplicação não tem BYPASSRLS; o papel sistema tem (uso explícito e auditado)', async () => {
    const migrador = await banco.conectar('pz_migrator');
    try {
      const { rows } = await migrador.query<{
        rolname: string;
        rolbypassrls: boolean;
        rolsuper: boolean;
      }>(
        "SELECT rolname, rolbypassrls, rolsuper FROM pg_roles WHERE rolname IN ('pz_app', 'pz_leitura', 'pz_migrator', 'pz_sistema') ORDER BY 1",
      );
      expect(rows).toEqual([
        { rolname: 'pz_app', rolbypassrls: false, rolsuper: false },
        { rolname: 'pz_leitura', rolbypassrls: false, rolsuper: false },
        { rolname: 'pz_migrator', rolbypassrls: false, rolsuper: false },
        { rolname: 'pz_sistema', rolbypassrls: true, rolsuper: false },
      ]);
    } finally {
      await migrador.end();
    }
  });

  it('isola os tenants: cada um só vê e altera o que é seu; sem contexto, nada', async () => {
    const sistema = await banco.conectar('pz_sistema');
    const app = await banco.conectar('pz_app');
    const migrador = await banco.conectar('pz_migrator');
    try {
      await sistema.query(
        `INSERT INTO tenant (id, nome, tipo) VALUES ($1, 'Escritório A', 'escritorio'), ($2, 'Autônomo B', 'autonomo')`,
        [TENANT_A, TENANT_B],
      );
      await sistema.query(
        `INSERT INTO usuario (id, tenant_id, nome, email) VALUES ($1, $2, 'Ana', 'ana@a.teste'), ($3, $4, 'Bia', 'bia@b.teste')`,
        [USUARIO_A, TENANT_A, USUARIO_B, TENANT_B],
      );

      const usuarios = (cliente: pg.Client) =>
        cliente
          .query<{ id: string }>('SELECT id FROM usuario ORDER BY id')
          .then((r) => r.rows.map((l) => l.id));

      expect(await comoTenant(app, TENANT_A, () => usuarios(app))).toEqual([USUARIO_A]);
      expect(await comoTenant(app, TENANT_B, () => usuarios(app))).toEqual([USUARIO_B]);
      expect(await comoTenant(app, undefined, () => usuarios(app))).toEqual([]);
      expect(await comoTenant(app, '', () => usuarios(app))).toEqual([]);
      // FORCE: nem o dono das tabelas (migrador) escapa do RLS.
      expect(await comoTenant(migrador, undefined, () => usuarios(migrador))).toEqual([]);

      const tenantsVisiveis = await comoTenant(app, TENANT_A, () =>
        app.query<{ id: string }>('SELECT id FROM tenant').then((r) => r.rows.map((l) => l.id)),
      );
      expect(tenantsVisiveis).toEqual([TENANT_A]);

      const alterados = await comoTenant(app, TENANT_A, () =>
        app
          .query("UPDATE usuario SET nome = 'invadido' WHERE id = $1", [USUARIO_B])
          .then((r) => r.rowCount),
      );
      expect(alterados).toBe(0);

      await expect(
        comoTenant(app, TENANT_A, () =>
          app.query(
            `INSERT INTO usuario (id, tenant_id, nome, email) VALUES ('01a10e00-0000-7000-8000-0000000000c1', $1, 'X', 'x@b.teste')`,
            [TENANT_B],
          ),
        ),
      ).rejects.toThrow(/row-level security/);

      await expect(comoTenant(app, 'nao-e-uuid', () => usuarios(app))).rejects.toThrow(/uuid/);

      // A aplicação não cria tenants (cadastro é do cliente sistema, HU06).
      await expect(
        comoTenant(app, TENANT_A, () =>
          app.query(`INSERT INTO tenant (id, nome, tipo) VALUES ($1, 'X', 'autonomo')`, [TENANT_A]),
        ),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await Promise.all([sistema.end(), app.end(), migrador.end()]);
    }
  });

  it('a aplicação não enxerga o controle de migrações nem chama o helper de RLS', async () => {
    const app = await banco.conectar('pz_app');
    try {
      await expect(app.query('SELECT * FROM _prisma_migrations')).rejects.toThrow(
        /permission denied/,
      );
      await expect(app.query("SELECT pz_habilitar_rls('usuario')")).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await app.end();
    }
  });
});

describe('busca textual', () => {
  it('portugues_sem_acento ignora acentos e reduz ao radical', async () => {
    const app = await banco.conectar('pz_app');
    try {
      const { rows } = await app.query<{ casa: boolean }>(
        "SELECT to_tsvector('portugues_sem_acento', 'Intimação da sentença publicada') @@ to_tsquery('portugues_sem_acento', 'intimacao & sentencas') AS casa",
      );
      expect(rows[0]?.casa).toBe(true);
    } finally {
      await app.end();
    }
  });
});
