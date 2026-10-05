// Seeds de desenvolvimento (`pnpm db:seed`): dados fictícios para o ambiente local, idempotentes.
// Usa o papel pz_sistema, porque criar tenants é operação do cadastro (cliente sistema, ADR-003).
// Nunca use dados reais de clientes aqui (CLAUDE.md, seção 3).
import pg from 'pg';

const url =
  process.env.DATABASE_URL_SISTEMA ??
  'postgresql://pz_sistema:pz_sistema_local@127.0.0.1:5432/prejuzero';

const TENANT_DEMONSTRACAO = '01a10e00-0000-7000-8000-00000000d001';
const USUARIO_DEMONSTRACAO = '01a10e00-0000-7000-8000-00000000d002';

const cliente = new pg.Client({ connectionString: url });
await cliente.connect();
try {
  await cliente.query('BEGIN');
  await cliente.query(
    `INSERT INTO tenant (id, nome, tipo) VALUES ($1, 'Escritório Demonstração', 'escritorio')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_DEMONSTRACAO],
  );
  await cliente.query(
    `INSERT INTO usuario (id, tenant_id, nome, email)
     VALUES ($1, $2, 'Pessoa Demonstração', 'demonstracao@prejuzero.local')
     ON CONFLICT (id) DO NOTHING`,
    [USUARIO_DEMONSTRACAO, TENANT_DEMONSTRACAO],
  );
  await cliente.query('COMMIT');
  process.stdout.write(`Seeds aplicados (tenant ${TENANT_DEMONSTRACAO}).\n`);
} catch (erro) {
  await cliente.query('ROLLBACK');
  throw erro;
} finally {
  await cliente.end();
}
