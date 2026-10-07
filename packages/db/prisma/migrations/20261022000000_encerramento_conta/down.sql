-- Reverte 20261022000000_encerramento_conta.
DROP FUNCTION IF EXISTS pz_efetivar_encerramento(uuid);
DELETE FROM "perfil_permissao" WHERE "permissao" = 'escritorio:encerrar';
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "encerrado_em";
DROP TABLE IF EXISTS "encerramento_conta";
