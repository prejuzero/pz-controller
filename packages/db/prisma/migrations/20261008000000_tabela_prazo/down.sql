-- Reverte 20261008000000_tabela_prazo (falha se já houver tenant do tipo plataforma).
DROP TABLE IF EXISTS "tabela_prazo";
DROP TABLE IF EXISTS "tipo_ato";
DROP FUNCTION IF EXISTS pz_tabela_prazo_imutavel();
DROP TYPE IF EXISTS "status_tabela_prazo";
DROP TYPE IF EXISTS "unidade_prazo";
DROP TYPE IF EXISTS "ramo_processual";
ALTER TYPE "tipo_tenant" RENAME TO "tipo_tenant_antigo";
CREATE TYPE "tipo_tenant" AS ENUM ('autonomo', 'escritorio');
ALTER TABLE "tenant" ALTER COLUMN "tipo" TYPE "tipo_tenant" USING "tipo"::text::"tipo_tenant";
DROP TYPE "tipo_tenant_antigo";
