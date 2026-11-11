-- Reverte 20261204000000_permissao_ciencia_confirmar.
DELETE FROM "perfil_permissao" WHERE "permissao" = 'ciencia:confirmar';
