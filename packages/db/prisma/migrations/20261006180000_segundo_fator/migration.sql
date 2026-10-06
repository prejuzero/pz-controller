-- 2FA TOTP (HU06, RFC 6238): segredo cifrado pela aplicação (AES-256-GCM), último passo aceito
-- (impede reutilizar o mesmo código) e hashes dos códigos de recuperação (uso único).

-- AlterTable
ALTER TABLE "usuario" ADD COLUMN "totp_segredo_cifrado" TEXT,
ADD COLUMN "totp_ativo_em" TIMESTAMPTZ(6),
ADD COLUMN "totp_ultimo_passo" BIGINT,
ADD COLUMN "codigos_recuperacao" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- O login informa se o usuário já tem 2FA ativo (para pedir a configuração ou a verificação).
GRANT SELECT ("totp_ativo_em") ON "usuario" TO pz_credencial;

SET ROLE pz_credencial;
DROP FUNCTION pz_localizar_credencial(text);
CREATE FUNCTION pz_localizar_credencial(p_email text)
  RETURNS TABLE (usuario_id uuid, tenant_id uuid, senha_hash text, segundo_fator_ativo boolean)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT id, tenant_id, senha_hash, totp_ativo_em IS NOT NULL
          FROM usuario WHERE lower(email) = lower(p_email) $$;
REVOKE ALL ON FUNCTION pz_localizar_credencial(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pz_localizar_credencial(text) TO pz_app;
RESET ROLE;
