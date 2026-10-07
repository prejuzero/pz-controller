import { randomInt, randomUUID } from 'node:crypto';

import type pg from 'pg';

/**
 * Apoio da suíte de isolamento entre tenants (HU05, PZ-98): descobre as tabelas de negócio pelo
 * catálogo do PostgreSQL e gera linhas válidas para qualquer uma delas, para que toda tabela nova
 * com tenant_id seja testada sem ninguém escrever teste para ela.
 */

export interface SituacaoRls {
  readonly tabela: string;
  readonly ativo: boolean;
  readonly forcado: boolean;
  readonly politicas: number;
}

/** Tabelas do schema public com coluna tenant_id (mais a própria tenant), com o estado do RLS. */
export async function tabelasDeNegocio(cliente: pg.Client): Promise<SituacaoRls[]> {
  const { rows } = await cliente.query<SituacaoRls>(`
    SELECT c.relname AS tabela, c.relrowsecurity AS ativo, c.relforcerowsecurity AS forcado,
           (SELECT count(*)::int FROM pg_policies p
             WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS politicas
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
     WHERE c.relkind IN ('r', 'p') AND NOT c.relispartition
       AND (c.relname = 'tenant' OR EXISTS (
             SELECT 1 FROM information_schema.columns col
              WHERE col.table_schema = 'public' AND col.table_name = c.relname
                AND col.column_name = 'tenant_id'))
     ORDER BY 1`);
  return rows;
}

/** Tabelas que deveriam estar isoladas e não estão: a lista precisa estar sempre vazia. */
export async function tabelasSemIsolamento(cliente: pg.Client): Promise<string[]> {
  return (await tabelasDeNegocio(cliente))
    .filter((t) => !t.ativo || !t.forcado || t.politicas === 0)
    .map((t) => t.tabela);
}

interface Coluna {
  readonly nome: string;
  readonly tipo: string;
  readonly udt: string;
  readonly referencia: string | null;
}

async function colunasObrigatorias(cliente: pg.Client, tabela: string): Promise<Coluna[]> {
  const { rows } = await cliente.query<Coluna>(
    `SELECT col.column_name AS nome, col.data_type AS tipo, col.udt_name AS udt,
            (SELECT ref.relname FROM pg_constraint con
               JOIN pg_class ref ON ref.oid = con.confrelid
               JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
              WHERE con.contype = 'f' AND con.conrelid = $1::regclass
                AND att.attname = col.column_name LIMIT 1) AS referencia
       FROM information_schema.columns col
      WHERE col.table_schema = 'public' AND col.table_name = $2
        AND col.is_nullable = 'NO' AND col.column_default IS NULL
      ORDER BY col.ordinal_position`,
    [`public.${tabela}`, tabela],
  );
  return rows;
}

async function valorPara(cliente: pg.Client, coluna: Coluna): Promise<unknown> {
  switch (coluna.tipo) {
    case 'uuid':
      return randomUUID();
    case 'text':
    case 'character varying':
      return `teste-${randomUUID()}`;
    // CHAR(n): cabe em qualquer tamanho; colunas com formato próprio vão em COLUNAS_FIXAS.
    case 'character':
      return 'X';
    case 'integer':
    case 'bigint':
    case 'smallint':
    case 'numeric':
      return 1;
    case 'boolean':
      return false;
    case 'jsonb':
    case 'json':
      return {};
    case 'ARRAY':
      return [];
    case 'timestamp with time zone':
    case 'timestamp without time zone':
    case 'date':
      return new Date();
    case 'USER-DEFINED': {
      const { rows } = await cliente.query<{ rotulo: string }>(
        `SELECT e.enumlabel AS rotulo FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = $1 ORDER BY e.enumsortorder LIMIT 1`,
        [coluna.udt],
      );
      if (rows[0] === undefined) throw new Error(`Tipo ${coluna.udt} sem valores conhecidos`);
      return rows[0].rotulo;
    }
    default:
      throw new Error(
        `Suíte de isolamento: tipo "${coluna.tipo}" da coluna ${coluna.nome} sem gerador. Acrescente-o em teste/isolamento.ts.`,
      );
  }
}

/** Tabelas globais referenciadas por tabelas de negócio: usa uma linha que a migração já semeou. */
const LINHAS_GLOBAIS: Readonly<Record<string, string>> = { perfil: 'advogado' };

/**
 * Colunas com valor fixo (ou gerado, se função) para a linha satisfazer as CHECKs e chaves únicas
 * da tabela (dados fictícios).
 */
const COLUNAS_FIXAS: Readonly<Record<string, Record<string, unknown>>> = {
  feriado_local: { abrangencia: 'uf', uf: 'XA' },
  advogado: { cpf: () => String(randomInt(1e10, 1e11 - 1)).padStart(11, '0') },
  oab: { uf: 'XA' },
  consentimento_canal: { canal: 'push', origem: 'app' },
};

/**
 * Insere uma linha válida na tabela para o tenant, criando antes as linhas referenciadas por
 * chave estrangeira (no mesmo tenant). Usa um cliente com BYPASSRLS (pz_sistema).
 */
export async function criarLinha(
  cliente: pg.Client,
  tabela: string,
  tenantId: string,
  profundidade = 0,
): Promise<Record<string, unknown>> {
  if (profundidade > 5) throw new Error(`Referências demais a partir de ${tabela}`);
  const valores: Record<string, unknown> = {};
  for (const coluna of await colunasObrigatorias(cliente, tabela)) {
    if (coluna.nome === 'tenant_id') valores[coluna.nome] = tenantId;
    else if (coluna.referencia === 'tenant') valores[coluna.nome] = tenantId;
    else if (coluna.referencia !== null && coluna.referencia in LINHAS_GLOBAIS)
      valores[coluna.nome] = LINHAS_GLOBAIS[coluna.referencia];
    else if (coluna.referencia !== null) {
      const pai = await criarLinha(cliente, coluna.referencia, tenantId, profundidade + 1);
      valores[coluna.nome] = pai.id;
    } else valores[coluna.nome] = await valorPara(cliente, coluna);
  }
  aplicarFixas(tabela, valores);
  const nomes = Object.keys(valores);
  const { rows } = await cliente.query<Record<string, unknown>>(
    `INSERT INTO ${tabela} (${nomes.map((n) => `"${n}"`).join(', ')})
     VALUES (${nomes.map((_, i) => `$${String(i + 1)}`).join(', ')}) RETURNING *`,
    nomes.map((n) => valores[n]),
  );
  const linha = rows[0];
  if (linha === undefined) throw new Error(`Falha ao criar linha em ${tabela}`);
  return linha;
}

/** Valores para uma nova linha da tabela, prontos para um INSERT feito por outro papel. */
export async function valoresDeLinhaNova(
  cliente: pg.Client,
  tabela: string,
  tenantId: string,
): Promise<Record<string, unknown>> {
  const valores: Record<string, unknown> = {};
  for (const coluna of await colunasObrigatorias(cliente, tabela)) {
    if (coluna.nome === 'tenant_id' || coluna.referencia === 'tenant')
      valores[coluna.nome] = tenantId;
    else if (coluna.referencia !== null && coluna.referencia in LINHAS_GLOBAIS)
      valores[coluna.nome] = LINHAS_GLOBAIS[coluna.referencia];
    else if (coluna.referencia !== null) {
      valores[coluna.nome] = (await criarLinha(cliente, coluna.referencia, tenantId)).id;
    } else valores[coluna.nome] = await valorPara(cliente, coluna);
  }
  return aplicarFixas(tabela, valores);
}

function aplicarFixas(tabela: string, valores: Record<string, unknown>): Record<string, unknown> {
  for (const [nome, valor] of Object.entries(COLUNAS_FIXAS[tabela] ?? {}))
    valores[nome] = typeof valor === 'function' ? (valor as () => unknown)() : valor;
  return valores;
}

/**
 * Tabelas só de inserção (ADR-006): UPDATE e DELETE são recusados para todos os papéis da
 * aplicação, uma garantia mais forte que o RLS (que só filtra o tenant). `feriado_local` aceita
 * só a revogação, controlada por trigger; qualquer outro UPDATE é recusado (HU13).
 */
export const TABELAS_SO_INSERCAO: readonly string[] = ['evento_auditoria', 'feriado_local'];

/** Tabelas sem DELETE para a aplicação (o registro fica: remoção vira estado, LGPD e prova). */
export const TABELAS_SEM_DELETE: readonly string[] = [
  'advogado',
  'oab',
  'notificacao',
  'consentimento_canal',
];
