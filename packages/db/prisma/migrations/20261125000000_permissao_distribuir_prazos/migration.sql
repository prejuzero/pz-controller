-- Delegar prazos (HU41): espelha PERFIS_PADRAO.admin_escritorio
-- (modules/identidade/domain/perfis.ts); o catálogo em código e esta tabela andam juntos.
INSERT INTO "perfil_permissao" ("perfil", "permissao") VALUES
  ('admin_escritorio', 'prazos:distribuir');
