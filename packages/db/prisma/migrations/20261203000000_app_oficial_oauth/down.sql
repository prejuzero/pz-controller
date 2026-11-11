-- Reverte 20261203000000_app_oficial_oauth: os clientes do app nos escritórios são revogados
-- (perdem o vínculo) antes de o registro sair.
UPDATE "cliente_oauth" SET "registro_dinamico_id" = NULL, "revogado_em" = COALESCE("revogado_em", CURRENT_TIMESTAMP)
 WHERE "registro_dinamico_id" = '019a0000-0000-7000-8000-00000000a990';
DELETE FROM "registro_oauth_dinamico" WHERE "id" = '019a0000-0000-7000-8000-00000000a990';
DROP INDEX IF EXISTS "registro_oauth_dinamico_app_oficial_key";
ALTER TABLE "registro_oauth_dinamico" DROP COLUMN IF EXISTS "app_oficial";
