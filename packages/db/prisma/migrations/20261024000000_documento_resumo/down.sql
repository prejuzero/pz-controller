-- Reverte 20261024000000_documento_resumo.
ALTER TABLE "documento_legal" DROP COLUMN IF EXISTS "resumo_alteracoes";
