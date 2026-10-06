import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  criarLinha,
  tabelasDeNegocio,
  TABELAS_SO_INSERCAO,
  tabelasSemIsolamento,
  valoresDeLinhaNova,
} from './teste/isolamento.js';
import { subirBancoDeTeste } from './teste/postgres.js';

import type { BancoDeTeste, Papel } from './teste/postgres.js';
import type pg from 'pg';

/**
 * Suíte de isolamento entre tenants (HU05, PZ-98, ADR-003). As tabelas são descobertas pelo
 * catálogo do PostgreSQL: toda tabela nova com tenant_id entra aqui automaticamente.
 */

// Dados fictícios de teste.
const TENANT_A = '01a10e00-0000-7000-8000-0000000a0001';
const TENANT_B = '01a10e00-0000-7000-8000-0000000b0001';

let banco: BancoDeTeste;
const clientes: Partial<Record<Papel, pg.Client>> = {};
let tabelas: string[] = [];

function cliente(papel: Papel): pg.Client {
  const encontrado = clientes[papel];
  if (encontrado === undefined) throw new Error(`cliente ${papel} não conectado`);
  return encontrado;
}

/** Executa numa transação com o tenant definido (ou sem nenhum) e sempre desfaz. */
async function noTenant<T>(
  papel: Papel,
  tenant: string | undefined,
  trabalho: (c: pg.Client) => Promise<T>,
) {
  const conexao = cliente(papel);
  await conexao.query('BEGIN');
  try {
    if (tenant !== undefined)
      await conexao.query("SELECT set_config('app.tenant_id', $1, true)", [tenant]);
    return await trabalho(conexao);
  } finally {
    await conexao.query('ROLLBACK');
  }
}

async function inserir(conexao: pg.Client, tabela: string, valores: Record<string, unknown>) {
  const nomes = Object.keys(valores);
  return conexao.query(
    `INSERT INTO ${tabela} (${nomes.map((n) => `"${n}"`).join(', ')}) VALUES (${nomes.map((_, i) => `$${String(i + 1)}`).join(', ')})`,
    nomes.map((n) => valores[n]),
  );
}

beforeAll(async () => {
  banco = await subirBancoDeTeste();
  await banco.migrar();
  for (const papel of ['pz_migrator', 'pz_app', 'pz_sistema', 'pz_leitura'] as const) {
    clientes[papel] = await banco.conectar(papel);
  }
  await cliente('pz_sistema').query(
    `INSERT INTO tenant (id, nome, tipo) VALUES ($1, 'Tenant A', 'escritorio'), ($2, 'Tenant B', 'autonomo')`,
    [TENANT_A, TENANT_B],
  );
  tabelas = (await tabelasDeNegocio(cliente('pz_migrator')))
    .map((t) => t.tabela)
    .filter((t) => t !== 'tenant');
  for (const tabela of tabelas) {
    for (const tenant of [TENANT_A, TENANT_B])
      await criarLinha(cliente('pz_sistema'), tabela, tenant);
  }
}, 300_000);

afterAll(async () => {
  await Promise.all(Object.values(clientes).map((c) => c.end()));
  await banco.parar();
});

describe('cobertura da suíte', () => {
  it('descobre as tabelas de negócio', () => {
    expect(tabelas.length).toBeGreaterThanOrEqual(3);
  });

  it('nenhuma tabela de negócio está sem RLS ligado, forçado e com política', async () => {
    expect(await tabelasSemIsolamento(cliente('pz_migrator'))).toEqual([]);
  });

  it('uma tabela nova com tenant_id sem RLS é apontada (faria a suíte falhar)', async () => {
    const migrador = cliente('pz_migrator');
    await migrador.query('BEGIN');
    try {
      await migrador.query(
        'CREATE TABLE tabela_esquecida (id uuid PRIMARY KEY, tenant_id uuid NOT NULL)',
      );
      expect(await tabelasSemIsolamento(migrador)).toEqual(['tabela_esquecida']);
    } finally {
      await migrador.query('ROLLBACK');
    }
  });
});

describe('isolamento por tabela (gerado do catálogo)', () => {
  it('o tenant A não lê, atualiza nem apaga dados do tenant B', async () => {
    for (const tabela of tabelas.filter((t) => !TABELAS_SO_INSERCAO.includes(t))) {
      const resultado = await noTenant('pz_app', TENANT_A, async (c) => ({
        visiveisDeB: (await c.query(`SELECT 1 FROM ${tabela} WHERE tenant_id = $1`, [TENANT_B]))
          .rowCount,
        todasDeA: (
          await c.query<{ tenant_id: string }>(`SELECT tenant_id FROM ${tabela}`)
        ).rows.every((l) => l.tenant_id === TENANT_A),
        atualizadasDeB: (
          await c.query(`UPDATE ${tabela} SET tenant_id = tenant_id WHERE tenant_id = $1`, [
            TENANT_B,
          ])
        ).rowCount,
        apagadasDeB: (await c.query(`DELETE FROM ${tabela} WHERE tenant_id = $1`, [TENANT_B]))
          .rowCount,
      }));
      expect(resultado, tabela).toEqual({
        visiveisDeB: 0,
        todasDeA: true,
        atualizadasDeB: 0,
        apagadasDeB: 0,
      });
    }
  });

  it('tabelas só de inserção: A não lê dados de B, e UPDATE/DELETE são recusados para qualquer papel', async () => {
    for (const tabela of TABELAS_SO_INSERCAO.filter((t) => tabelas.includes(t))) {
      const visiveis = await noTenant('pz_app', TENANT_A, (c) =>
        c.query(`SELECT 1 FROM ${tabela} WHERE tenant_id = $1`, [TENANT_B]),
      );
      expect(visiveis.rowCount, tabela).toBe(0);
      for (const papel of ['pz_app', 'pz_sistema', 'pz_leitura'] as const) {
        for (const comando of [
          `UPDATE ${tabela} SET tenant_id = tenant_id`,
          `DELETE FROM ${tabela}`,
          `TRUNCATE ${tabela}`,
        ]) {
          await expect(
            noTenant(papel, TENANT_A, (c) => c.query(comando)),
            `${papel}: ${comando}`,
          ).rejects.toThrow(/permission denied|imutável/);
        }
      }
    }
  });

  it('INSERT com tenant alheio falha (WITH CHECK)', async () => {
    for (const tabela of tabelas) {
      const valores = await valoresDeLinhaNova(cliente('pz_sistema'), tabela, TENANT_B);
      await expect(
        noTenant('pz_app', TENANT_A, (c) => inserir(c, tabela, valores)),
        tabela,
      ).rejects.toThrow(/row-level security/);
    }
  });

  it('mover uma linha para outro tenant falha (WITH CHECK)', async () => {
    for (const tabela of tabelas.filter((t) => !TABELAS_SO_INSERCAO.includes(t))) {
      await expect(
        noTenant('pz_app', TENANT_A, (c) =>
          c.query(`UPDATE ${tabela} SET tenant_id = $1`, [TENANT_B]),
        ),
        tabela,
      ).rejects.toThrow(/row-level security/);
    }
  });

  it('sem tenant no contexto, a consulta não retorna nada', async () => {
    for (const papel of ['pz_app', 'pz_leitura', 'pz_migrator'] as const) {
      for (const tabela of [...tabelas, 'tenant']) {
        const linhas = await noTenant(papel, undefined, (c) => c.query(`SELECT 1 FROM ${tabela}`));
        expect(linhas.rowCount, `${papel} em ${tabela}`).toBe(0);
      }
    }
  });

  it('o papel de leitura também é isolado e não escreve', async () => {
    for (const tabela of tabelas) {
      const deB = await noTenant('pz_leitura', TENANT_A, (c) =>
        c.query(`SELECT 1 FROM ${tabela} WHERE tenant_id = $1`, [TENANT_B]),
      );
      expect(deB.rowCount, tabela).toBe(0);
      const valores = await valoresDeLinhaNova(cliente('pz_sistema'), tabela, TENANT_A);
      await expect(
        noTenant('pz_leitura', TENANT_A, (c) => inserir(c, tabela, valores)),
        tabela,
      ).rejects.toThrow(/permission denied/);
    }
  });

  it('na tabela tenant, cada tenant só enxerga e altera a si mesmo', async () => {
    const resultado = await noTenant('pz_app', TENANT_A, async (c) => ({
      visiveis: (await c.query<{ id: string }>('SELECT id FROM tenant')).rows.map((l) => l.id),
      alteradosDeB: (await c.query("UPDATE tenant SET nome = 'invadido' WHERE id = $1", [TENANT_B]))
        .rowCount,
    }));
    expect(resultado).toEqual({ visiveis: [TENANT_A], alteradosDeB: 0 });
  });
});
