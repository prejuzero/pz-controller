-- Reverte 20261129000000_registro_oauth_dinamico.
DROP INDEX "cliente_oauth_registro_dinamico_key";
ALTER TABLE "cliente_oauth" DROP CONSTRAINT "cliente_oauth_registro_dinamico_id_fkey";
ALTER TABLE "cliente_oauth" DROP COLUMN "registro_dinamico_id";
DROP TABLE "registro_oauth_dinamico";
