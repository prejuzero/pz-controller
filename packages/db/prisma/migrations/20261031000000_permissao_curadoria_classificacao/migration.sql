-- Fila de revisão manual da classificação (HU21): espelha PERFIS_PADRAO.curador
-- (modules/identidade/domain/perfis.ts); o catálogo em código e esta tabela andam juntos.
INSERT INTO "perfil_permissao" ("perfil", "permissao") VALUES
  ('curador', 'curadoria:classificacao');
