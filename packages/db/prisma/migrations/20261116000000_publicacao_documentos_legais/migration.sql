-- Publicação de documentos legais pelo administrador da plataforma (PZ-303, HU38).
-- documento_legal é global (sem tenant_id, sem RLS): a aplicação passa a inserir versão nova,
-- só pela rota com a permissão abaixo. Atualizar e apagar continuam proibidos (imutável).
GRANT INSERT ON "documento_legal" TO pz_app;

-- Espelha PERFIS_PADRAO.admin_plataforma (modules/identidade/domain/perfis.ts).
INSERT INTO "perfil_permissao" ("perfil", "permissao") VALUES
  ('admin_plataforma', 'admin:documentos-legais');
