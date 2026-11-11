-- Confirmar ciência (HU68): permissão própria, separada de confirmar a data do prazo, para o app
-- oficial receber só ela (decisão do usuário em 11/11/2026). Espelha PERFIS_PADRAO
-- (modules/identidade/domain/perfis.ts): quem já confirmava prazos continua dando ciência.
INSERT INTO "perfil_permissao" ("perfil", "permissao")
SELECT "perfil", 'ciencia:confirmar' FROM "perfil_permissao" WHERE "permissao" = 'prazos:confirmar'
ON CONFLICT DO NOTHING;
