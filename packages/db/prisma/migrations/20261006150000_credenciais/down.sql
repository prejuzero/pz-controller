-- Reverte 20261006150000_credenciais.
-- A função pertence ao pz_credencial: o migrador assume o papel só para removê-la.
SET ROLE pz_credencial;
DROP FUNCTION IF EXISTS pz_localizar_credencial(text);
RESET ROLE;
DROP POLICY IF EXISTS localizar_credencial ON "usuario";
REVOKE SELECT ("id", "tenant_id", "email", "senha_hash") ON "usuario" FROM pz_credencial;
DROP INDEX IF EXISTS "usuario_email_global_key";
ALTER TABLE "usuario" DROP COLUMN IF EXISTS "senha_hash";
