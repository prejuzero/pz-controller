-- Reverte 20261031000000_permissao_curadoria_classificacao.
DELETE FROM "perfil_permissao" WHERE "perfil" = 'curador' AND "permissao" = 'curadoria:classificacao';
