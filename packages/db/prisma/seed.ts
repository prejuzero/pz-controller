// Seeds de desenvolvimento (`pnpm db:seed`): dados fictícios para o ambiente local, idempotentes.
// Usa o papel pz_sistema, porque criar tenants é operação do cadastro (cliente sistema, ADR-003).
// Nunca use dados reais de clientes aqui (CLAUDE.md, seção 3).
import { argon2, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';

import pg from 'pg';

const url =
  process.env.DATABASE_URL_SISTEMA ??
  'postgresql://pz_sistema:pz_sistema_local@127.0.0.1:5432/prejuzero';

const TENANT_DEMONSTRACAO = '01a10e00-0000-7000-8000-00000000d001';
const USUARIO_DEMONSTRACAO = '01a10e00-0000-7000-8000-00000000d002';

// Senha só do ambiente local (fictícia); troque por SENHA_DEMONSTRACAO se quiser outra.
const SENHA = process.env.SENHA_DEMONSTRACAO ?? 'demonstracao local 2026';

/** Mesmo formato e parâmetros do HasherArgon2 do módulo identidade (PHC, OWASP). */
async function hashArgon2id(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = await promisify(argon2)('argon2id', {
    message: Buffer.from(senha.normalize('NFC'), 'utf8'),
    nonce: sal,
    memory: 19_456,
    passes: 2,
    parallelism: 1,
    tagLength: 32,
  });
  const b64 = (dados: Buffer) => dados.toString('base64').replace(/=+$/, '');
  return `$argon2id$v=19$m=19456,t=2,p=1$${b64(sal)}$${b64(hash)}`;
}

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
  await cliente.query('UPDATE usuario SET senha_hash = $2 WHERE id = $1 AND senha_hash IS NULL', [
    USUARIO_DEMONSTRACAO,
    await hashArgon2id(SENHA),
  ]);
  await cliente.query('COMMIT');
  process.stdout.write(
    `Seeds aplicados (tenant ${TENANT_DEMONSTRACAO}; login demonstracao@prejuzero.local).\n`,
  );
} catch (erro) {
  await cliente.query('ROLLBACK');
  throw erro;
} finally {
  await cliente.end();
}
