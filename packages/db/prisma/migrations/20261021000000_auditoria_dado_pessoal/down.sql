-- Reverte 20261021000000_auditoria_dado_pessoal.
ALTER TABLE "evento_auditoria" DROP COLUMN IF EXISTS "dados_pessoais";
DROP TABLE IF EXISTS "auditoria_dado_pessoal";
DROP FUNCTION IF EXISTS pz_auditoria_dado_pessoal_so_pseudonimiza();
