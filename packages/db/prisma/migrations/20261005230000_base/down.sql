-- Reverte 20261005230000_base (na ordem inversa).
DROP TEXT SEARCH CONFIGURATION IF EXISTS portugues_sem_acento;
DROP TABLE IF EXISTS "evento_processado";
DROP TABLE IF EXISTS "evento_dominio";
DROP TABLE IF EXISTS "usuario";
DROP TABLE IF EXISTS "tenant";
DROP TYPE IF EXISTS "tipo_tenant";
DROP FUNCTION IF EXISTS pz_habilitar_rls(regclass);
DROP FUNCTION IF EXISTS pz_tenant_atual();
