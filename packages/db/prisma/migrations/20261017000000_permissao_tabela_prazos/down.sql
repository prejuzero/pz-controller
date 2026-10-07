-- Reverte 20261017000000_permissao_tabela_prazos.
DELETE FROM "perfil_permissao" WHERE "perfil" = 'curador' AND "permissao" = 'curadoria:tabela-prazos';
