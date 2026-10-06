-- Reverte 20261009000000_perfis.
DROP TABLE IF EXISTS "usuario_perfil";
DROP FUNCTION IF EXISTS pz_usuario_perfil_valido();
DROP TABLE IF EXISTS "perfil_permissao";
DROP TABLE IF EXISTS "perfil";
