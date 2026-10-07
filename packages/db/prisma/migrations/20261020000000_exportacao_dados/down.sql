-- Reverte 20261020000000_exportacao_dados.
DELETE FROM "perfil_permissao" WHERE "permissao" = 'escritorio:exportar';
DROP TABLE IF EXISTS "exportacao_dados";
DROP TYPE IF EXISTS "situacao_exportacao";
DROP TYPE IF EXISTS "escopo_exportacao";
