-- Reverte 20261118000000_relatorio_arquivo_removido.
DROP INDEX IF EXISTS "relatorio_expira_em_pendente_remocao_idx";
ALTER TABLE "relatorio" DROP COLUMN IF EXISTS "arquivo_removido_em";
