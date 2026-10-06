-- Reverte 20261006000000_indices_limpeza_outbox.
DROP INDEX IF EXISTS "evento_dominio_publicados_idx";
DROP INDEX IF EXISTS "evento_processado_processado_em_idx";
