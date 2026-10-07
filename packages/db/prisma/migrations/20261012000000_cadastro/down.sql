-- Reverte 20261012000000_cadastro.
DROP TABLE IF EXISTS "oab";
DROP TABLE IF EXISTS "advogado";
DROP TYPE IF EXISTS "tipo_oab";
DROP POLICY IF EXISTS cadastro_autonomo ON "tenant";
REVOKE INSERT ON "tenant" FROM pz_app;
