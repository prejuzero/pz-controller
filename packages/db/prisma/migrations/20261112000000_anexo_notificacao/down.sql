-- Reverte 20261112000000_anexo_notificacao.
ALTER TABLE "notificacao" DROP COLUMN IF EXISTS "anexo";
