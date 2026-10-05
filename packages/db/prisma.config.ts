import { defineConfig } from 'prisma/config';

// Migrações rodam com o papel pz_migrator (DDL); a aplicação usa pz_app (DML, sem BYPASSRLS).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: {
    url:
      process.env.DATABASE_URL_MIGRACAO ??
      'postgresql://pz_migrator:pz_migrator_local@127.0.0.1:5432/prejuzero',
  },
});
