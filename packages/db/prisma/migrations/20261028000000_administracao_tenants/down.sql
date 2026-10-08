-- Reverte 20261028000000_administracao_tenants.
DROP POLICY IF EXISTS plataforma_le_tenants ON "tenant";
SET ROLE pz_credencial;
DROP FUNCTION IF EXISTS pz_plataforma_atual();
DROP FUNCTION IF EXISTS pz_localizar_credencial(text);
CREATE FUNCTION pz_localizar_credencial(p_email text)
  RETURNS TABLE (usuario_id uuid, tenant_id uuid, senha_hash text, segundo_fator_ativo boolean)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT id, tenant_id, senha_hash, totp_ativo_em IS NOT NULL
          FROM usuario WHERE lower(email) = lower(p_email) $$;
REVOKE ALL ON FUNCTION pz_localizar_credencial(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pz_localizar_credencial(text) TO pz_app;
RESET ROLE;
DROP POLICY IF EXISTS credencial_le_tenant ON "tenant";
REVOKE SELECT ("id", "tipo", "suspenso_em") ON "tenant" FROM pz_credencial;
ALTER TABLE "tenant"
  DROP CONSTRAINT IF EXISTS "tenant_suspensao",
  DROP COLUMN IF EXISTS "motivo_suspensao",
  DROP COLUMN IF EXISTS "suspenso_em",
  DROP COLUMN IF EXISTS "situacao_assinatura",
  DROP COLUMN IF EXISTS "plano";
DROP TYPE IF EXISTS "situacao_assinatura";
