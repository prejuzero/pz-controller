-- Reverte 20261116000000_publicacao_documentos_legais.
DELETE FROM "perfil_permissao" WHERE "perfil" = 'admin_plataforma' AND "permissao" = 'admin:documentos-legais';
REVOKE INSERT ON "documento_legal" FROM pz_app;
