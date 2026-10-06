-- Perfil curador (HU13): advogado da equipe PrejuZero que mantém o calendário forense global
-- (e, depois, a tabela de prazos). Como admin_plataforma, só existe no tenant plataforma.

INSERT INTO "perfil" ("codigo", "nome", "descricao") VALUES
  ('curador', 'Curador jurídico', 'Equipe PrejuZero: propõe, aprova (quatro olhos) e revoga o calendário forense global.');

INSERT INTO "perfil_permissao" ("perfil", "permissao") VALUES
  ('curador', 'conta:gerir'),
  ('curador', 'curadoria:calendario');

CREATE OR REPLACE FUNCTION pz_usuario_perfil_valido() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW.perfil IN ('admin_plataforma', 'curador')
     AND NOT EXISTS (SELECT 1 FROM tenant WHERE id = NEW.tenant_id AND tipo = 'plataforma') THEN
    RAISE EXCEPTION 'usuario_perfil: % só pode ser atribuído no tenant plataforma', NEW.perfil
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
