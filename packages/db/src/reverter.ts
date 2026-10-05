// `pnpm db:revert`: reverte a última migração aplicada (usa DATABASE_URL_MIGRACAO).
import pg from 'pg';

import { reverterUltimaMigracao } from './migracoes.js';

const url =
  process.env.DATABASE_URL_MIGRACAO ??
  'postgresql://pz_migrator:pz_migrator_local@127.0.0.1:5432/prejuzero';
const cliente = new pg.Client({ connectionString: url });

await cliente.connect();
try {
  const revertida = await reverterUltimaMigracao(cliente);
  process.stdout.write(
    revertida === undefined ? 'Nenhuma migração aplicada.\n' : `Migração revertida: ${revertida}\n`,
  );
} finally {
  await cliente.end();
}
