-- Reverte 20261007000000_evento_auditoria (só em desenvolvimento: a trilha nunca é apagada em produção).
DROP TABLE IF EXISTS "evento_auditoria" CASCADE;
DELETE FROM partman.part_config WHERE parent_table = 'public.evento_auditoria';
DROP TABLE IF EXISTS partman.template_public_evento_auditoria;
DROP FUNCTION IF EXISTS pz_auditoria_imutavel();
