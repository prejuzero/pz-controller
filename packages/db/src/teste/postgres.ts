import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import pg from 'pg';
import { GenericContainer, Wait } from 'testcontainers';

import type { StartedTestContainer } from 'testcontainers';

const executar = promisify(execFile);
const raizDoPacote = fileURLToPath(new URL('../..', import.meta.url));
const pastaDaImagem = fileURLToPath(new URL('../../../../infra/docker/postgres', import.meta.url));

export type Papel = 'pz_migrator' | 'pz_app' | 'pz_sistema' | 'pz_leitura' | 'pz_dev';

const SENHAS: Readonly<Record<Papel, string>> = {
  pz_dev: 'pz_dev_local',
  pz_migrator: 'pz_migrator_local',
  pz_app: 'pz_app_local',
  pz_sistema: 'pz_sistema_local',
  pz_leitura: 'pz_leitura_local',
};

export interface BancoDeTeste {
  url(papel: Papel): string;
  conectar(papel: Papel): Promise<pg.Client>;
  migrar(): Promise<void>;
  parar(): Promise<void>;
}

/**
 * PostgreSQL 16 real (a mesma imagem do ambiente local, com extensões e papéis), para os
 * testes de integração. Nada de mock de banco (CLAUDE.md, seção 13).
 */
export async function subirBancoDeTeste(): Promise<BancoDeTeste> {
  const imagem = await GenericContainer.fromDockerfile(pastaDaImagem).build(
    'prejuzero/postgres-teste',
    {
      deleteOnExit: false,
    },
  );
  const conteiner: StartedTestContainer = await imagem
    .withEnvironment({
      POSTGRES_USER: 'pz_dev',
      POSTGRES_PASSWORD: SENHAS.pz_dev,
      POSTGRES_DB: 'prejuzero',
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forHealthCheck())
    .start();

  const url = (papel: Papel) =>
    `postgresql://${papel}:${SENHAS[papel]}@${conteiner.getHost()}:${String(conteiner.getMappedPort(5432))}/prejuzero`;

  return {
    url,
    async conectar(papel) {
      const cliente = new pg.Client({ connectionString: url(papel) });
      await cliente.connect();
      return cliente;
    },
    async migrar() {
      const { stdout } = await executar('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
        cwd: raizDoPacote,
        env: { ...process.env, DATABASE_URL_MIGRACAO: url('pz_migrator') },
      });
      // O CLI do Prisma pode terminar com sucesso mesmo quando o motor falha: confere a saída.
      if (
        !/All migrations have been successfully applied|No pending migrations to apply/.test(stdout)
      ) {
        throw new Error(`prisma migrate deploy não confirmou as migrações:\n${stdout}`);
      }
    },
    async parar() {
      await conteiner.stop();
    },
  };
}
