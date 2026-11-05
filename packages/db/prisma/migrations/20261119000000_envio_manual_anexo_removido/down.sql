-- Reverte 20261119000000_envio_manual_anexo_removido.
DROP INDEX IF EXISTS "envio_manual_criado_em_anexo_pendente_idx";
ALTER TABLE "envio_manual" DROP COLUMN IF EXISTS "anexo_removido_em";
