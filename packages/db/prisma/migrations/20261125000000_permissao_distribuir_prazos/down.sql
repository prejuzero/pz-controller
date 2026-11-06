-- Reverte 20261125000000_permissao_distribuir_prazos.
DELETE FROM "perfil_permissao" WHERE "permissao" = 'prazos:distribuir';
