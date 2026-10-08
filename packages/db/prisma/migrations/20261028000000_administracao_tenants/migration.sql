-- Administração de tenants (HU39, PZ-228): plano e situação da assinatura (manuais no MVP; gateway
-- futuro pela porta ProvedorCobranca) e suspensão do acesso. A suspensão só bloqueia o acesso
-- (login e renovação de tokens); captura, cálculo e avisos continuam (decisão do PO, 08/10/2026).
CREATE TYPE "situacao_assinatura" AS ENUM ('teste', 'ativa', 'inadimplente', 'cancelada');

ALTER TABLE "tenant"
  ADD COLUMN "plano" TEXT,
  ADD COLUMN "situacao_assinatura" "situacao_assinatura" NOT NULL DEFAULT 'teste',
  ADD COLUMN "suspenso_em" TIMESTAMPTZ(6),
  ADD COLUMN "motivo_suspensao" TEXT,
  ADD CONSTRAINT "tenant_suspensao" CHECK (("suspenso_em" IS NULL) = ("motivo_suspensao" IS NULL));

-- pz_credencial (dono das funções restritas, sem BYPASSRLS) passa a ler o tipo e a suspensão de
-- qualquer tenant, só por estas funções.
GRANT SELECT ("id", "tipo", "suspenso_em") ON "tenant" TO pz_credencial;
CREATE POLICY credencial_le_tenant ON "tenant" FOR SELECT TO pz_credencial USING (true);

SET ROLE pz_credencial;
-- O login informa se o escritório está suspenso (a sessão não nasce).
DROP FUNCTION pz_localizar_credencial(text);
CREATE FUNCTION pz_localizar_credencial(p_email text)
  RETURNS TABLE (
    usuario_id uuid, tenant_id uuid, senha_hash text, segundo_fator_ativo boolean,
    tenant_suspenso boolean
  )
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT u.id, u.tenant_id, u.senha_hash, u.totp_ativo_em IS NOT NULL,
               t.suspenso_em IS NOT NULL
          FROM usuario u JOIN tenant t ON t.id = u.tenant_id
         WHERE lower(u.email) = lower(p_email) $$;
REVOKE ALL ON FUNCTION pz_localizar_credencial(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pz_localizar_credencial(text) TO pz_app;

-- Verdadeiro quando a transação roda no tenant da plataforma (administração, curadoria).
CREATE FUNCTION pz_plataforma_atual() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT EXISTS (SELECT 1 FROM tenant WHERE id = pz_tenant_atual() AND tipo = 'plataforma') $$;
REVOKE ALL ON FUNCTION pz_plataforma_atual() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pz_plataforma_atual() TO pz_app;
RESET ROLE;

-- A plataforma lê a linha de todos os tenants (nome, tipo, plano, suspensão) para administrá-los.
-- Só leitura e só a tabela tenant: dados de negócio continuam isolados (impersonação para o resto).
-- Alterar um tenant continua exigindo rodar no próprio tenant (política isolamento_tenant).
CREATE POLICY plataforma_le_tenants ON "tenant" FOR SELECT TO pz_app USING (pz_plataforma_atual());
