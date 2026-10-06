-- Credenciais (HU06): hash da senha (Argon2id) e e-mail único no sistema (decisão de 06/10/2026:
-- um e-mail = um usuário = um escritório), para o login localizar o usuário antes do tenant.

-- AlterTable
ALTER TABLE "usuario" ADD COLUMN "senha_hash" TEXT;

-- E-mail único no sistema, sem diferenciar maiúsculas.
CREATE UNIQUE INDEX "usuario_email_global_key" ON "usuario" (lower("email"));

-- Login antes de saber o tenant, sem dar BYPASSRLS à api: esta função devolve só (usuário,
-- tenant, hash) de UM e-mail. Roda com os direitos do dono, o papel pz_credencial (sem login,
-- sem BYPASSRLS), que só lê estas 4 colunas de `usuario` por uma política própria. O pz_app só
-- executa a função; os demais papéis continuam isolados pelo RLS.
GRANT SELECT ("id", "tenant_id", "email", "senha_hash") ON "usuario" TO pz_credencial;
CREATE POLICY localizar_credencial ON "usuario" FOR SELECT TO pz_credencial USING (true);

CREATE FUNCTION pz_localizar_credencial(p_email text)
  RETURNS TABLE (usuario_id uuid, tenant_id uuid, senha_hash text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT id, tenant_id, senha_hash FROM usuario WHERE lower(email) = lower(p_email) $$;

ALTER FUNCTION pz_localizar_credencial(text) OWNER TO pz_credencial;
REVOKE ALL ON FUNCTION pz_localizar_credencial(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pz_localizar_credencial(text) TO pz_app;
