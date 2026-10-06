-- Reverte 20261006180000_segundo_fator.
SET ROLE pz_credencial;
DROP FUNCTION IF EXISTS pz_localizar_credencial(text);
CREATE FUNCTION pz_localizar_credencial(p_email text)
  RETURNS TABLE (usuario_id uuid, tenant_id uuid, senha_hash text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT id, tenant_id, senha_hash FROM usuario WHERE lower(email) = lower(p_email) $$;
REVOKE ALL ON FUNCTION pz_localizar_credencial(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pz_localizar_credencial(text) TO pz_app;
RESET ROLE;
REVOKE SELECT ("totp_ativo_em") ON "usuario" FROM pz_credencial;
ALTER TABLE "usuario" DROP COLUMN IF EXISTS "codigos_recuperacao",
DROP COLUMN IF EXISTS "totp_ultimo_passo",
DROP COLUMN IF EXISTS "totp_ativo_em",
DROP COLUMN IF EXISTS "totp_segredo_cifrado";
