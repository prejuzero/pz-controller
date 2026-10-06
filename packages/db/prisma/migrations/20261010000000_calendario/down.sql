-- Reverte 20261010000000_calendario.
DROP TABLE IF EXISTS "feriado_local";
DROP TABLE IF EXISTS "evento_calendario";
DROP FUNCTION IF EXISTS pz_feriado_local_imutavel();
DROP FUNCTION IF EXISTS pz_evento_calendario_imutavel();
DROP TYPE IF EXISTS "status_evento_calendario";
DROP TYPE IF EXISTS "tipo_evento_calendario";
DROP TYPE IF EXISTS "abrangencia_calendario";
