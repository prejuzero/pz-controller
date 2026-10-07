-- Reverte 20261016000000_processos_clientes.
DELETE FROM "perfil_permissao" WHERE "permissao" IN ('processos:ler', 'processos:gerir');
DROP TABLE IF EXISTS "processo";
DROP TABLE IF EXISTS "cliente";
DROP TYPE IF EXISTS "cobertura_processo";
