// Conta de curadora no piloto (decisão do usuário em 11/11/2026): o seed não roda no piloto (as
// contas de demonstração têm senha conhecida), então a curadora nasce por este comando, sem
// senha. Ela define a senha em "Esqueci minha senha" no portal (link por e-mail, de uso único) e
// ativa o 2FA no primeiro acesso. Uso: pnpm piloto:curadora --email ana@escritorio.com.br --nome "Ana"
import { parseArgs } from 'node:util';

import { gerarUuidV7 } from '@pz/kernel';
import pg from 'pg';

const { values } = parseArgs({
  options: { email: { type: 'string' }, nome: { type: 'string' } },
});
const email = values.email?.trim().toLowerCase() ?? '';
const nome = values.nome?.trim() ?? '';
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || nome.length < 2) {
  process.stderr.write('Uso: pnpm piloto:curadora --email <e-mail> --nome "<nome completo>"\n');
  process.exit(1);
}

// O mesmo tenant técnico da api (TENANT_PLATAFORMA_ID): o perfil curador só existe nele.
const TENANT_PLATAFORMA =
  process.env.TENANT_PLATAFORMA_ID ?? '01a10e00-0000-7000-8000-00000000c001';
const url =
  process.env.DATABASE_URL_SISTEMA ??
  'postgresql://pz_sistema:pz_sistema_local@127.0.0.1:5432/prejuzero';

const cliente = new pg.Client({ connectionString: url });
await cliente.connect();
try {
  await cliente.query('BEGIN');
  await cliente.query(
    `INSERT INTO tenant (id, nome, tipo) VALUES ($1, 'PrejuZero (curadoria)', 'plataforma')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_PLATAFORMA],
  );
  await cliente.query(`SELECT set_config('app.tenant_id', $1, true)`, [TENANT_PLATAFORMA]);
  const existente = await cliente.query<{ id: string; tenant_id: string }>(
    'SELECT id, tenant_id FROM usuario WHERE lower(email) = $1',
    [email],
  );
  const atual = existente.rows[0];
  if (atual !== undefined && atual.tenant_id !== TENANT_PLATAFORMA) {
    throw new Error(`O e-mail ${email} já é de um escritório; use outro e-mail para a curadoria.`);
  }
  const id = atual?.id ?? gerarUuidV7();
  if (atual === undefined) {
    await cliente.query(
      'INSERT INTO usuario (id, tenant_id, nome, email) VALUES ($1, $2, $3, $4)',
      [id, TENANT_PLATAFORMA, nome, email],
    );
  }
  await cliente.query(
    `INSERT INTO usuario_perfil (tenant_id, usuario_id, perfil) VALUES ($1, $2, 'curador')
     ON CONFLICT DO NOTHING`,
    [TENANT_PLATAFORMA, id],
  );
  await cliente.query('COMMIT');
  process.stdout.write(
    `Curadora ${atual === undefined ? 'criada' : 'já existia; perfil conferido'}: ${email}.\n` +
      'Ela entra pelo portal em "Esqueci minha senha", define a senha pelo e-mail e ativa o 2FA.\n',
  );
} catch (erro) {
  await cliente.query('ROLLBACK');
  throw erro;
} finally {
  await cliente.end();
}
