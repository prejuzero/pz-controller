-- Reverte 20261011000000_perfil_curador (falha se algum usuário tiver o perfil curador).
CREATE OR REPLACE FUNCTION pz_usuario_perfil_valido() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW.perfil = 'admin_plataforma'
     AND NOT EXISTS (SELECT 1 FROM tenant WHERE id = NEW.tenant_id AND tipo = 'plataforma') THEN
    RAISE EXCEPTION 'usuario_perfil: admin_plataforma só pode ser atribuído no tenant plataforma'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
DELETE FROM "perfil_permissao" WHERE "perfil" = 'curador';
DELETE FROM "perfil" WHERE "codigo" = 'curador';
