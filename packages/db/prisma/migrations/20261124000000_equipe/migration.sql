-- Escritório multiusuário (HU41, PR 1): convites por e-mail, desativação de membros e o titular
-- como administrador do escritório (decisão do usuário em 06/11/2026).

-- Membro desativado: não entra mais; o histórico continua apontando para ele.
ALTER TABLE "usuario" ADD COLUMN "desativado_em" TIMESTAMPTZ(6);

-- Convite: só o hash do token (uso único, 7 dias). Aceitar cria o usuário no tenant do convite.
CREATE TABLE "convite_membro" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "perfil" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "criado_por" UUID NOT NULL,
    "expira_em" TIMESTAMPTZ(6) NOT NULL,
    "aceito_em" TIMESTAMPTZ(6),
    "cancelado_em" TIMESTAMPTZ(6),
    "usuario_id" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "convite_membro_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "convite_membro_um_desfecho" CHECK ("aceito_em" IS NULL OR "cancelado_em" IS NULL)
);

CREATE UNIQUE INDEX "convite_membro_token_hash_key" ON "convite_membro"("token_hash");
-- Um convite aberto por e-mail no escritório.
CREATE UNIQUE INDEX "convite_membro_aberto_key" ON "convite_membro"("tenant_id", lower("email"))
  WHERE "aceito_em" IS NULL AND "cancelado_em" IS NULL;
CREATE INDEX "convite_membro_tenant_id_idx" ON "convite_membro"("tenant_id");

ALTER TABLE "convite_membro" ADD CONSTRAINT "convite_membro_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "convite_membro" ADD CONSTRAINT "convite_membro_perfil_fkey" FOREIGN KEY ("perfil") REFERENCES "perfil"("codigo") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "convite_membro" ADD CONSTRAINT "convite_membro_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

SELECT pz_habilitar_rls('convite_membro');
REVOKE DELETE ON "convite_membro" FROM pz_app, pz_sistema;

-- O aceite chega sem sessão (link do e-mail): como no login, uma função do papel pz_credencial
-- devolve só o necessário de UM convite, pelo hash do token. A api segue sem BYPASSRLS.
GRANT SELECT ("id", "tenant_id", "email", "nome", "perfil", "token_hash", "expira_em", "aceito_em", "cancelado_em") ON "convite_membro" TO pz_credencial;
CREATE POLICY localizar_convite ON "convite_membro" FOR SELECT TO pz_credencial USING (true);
GRANT SELECT ("desativado_em") ON "usuario" TO pz_credencial;

SET ROLE pz_credencial;
CREATE FUNCTION pz_localizar_convite(p_hash text)
  RETURNS TABLE (
    id uuid, tenant_id uuid, email text, nome text, perfil text, expira_em timestamptz,
    aberto boolean, tenant_suspenso boolean
  )
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT c.id, c.tenant_id, c.email, c.nome, c.perfil, c.expira_em,
               c.aceito_em IS NULL AND c.cancelado_em IS NULL, t.suspenso_em IS NOT NULL
          FROM convite_membro c JOIN tenant t ON t.id = c.tenant_id
         WHERE c.token_hash = p_hash $$;
REVOKE ALL ON FUNCTION pz_localizar_convite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pz_localizar_convite(text) TO pz_app;

-- O login passa a saber se o membro foi desativado.
DROP FUNCTION pz_localizar_credencial(text);
CREATE FUNCTION pz_localizar_credencial(p_email text)
  RETURNS TABLE (
    usuario_id uuid, tenant_id uuid, senha_hash text, segundo_fator_ativo boolean,
    tenant_suspenso boolean, usuario_desativado boolean
  )
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT u.id, u.tenant_id, u.senha_hash, u.totp_ativo_em IS NOT NULL,
               t.suspenso_em IS NOT NULL, u.desativado_em IS NOT NULL
          FROM usuario u JOIN tenant t ON t.id = u.tenant_id
         WHERE lower(u.email) = lower(p_email) $$;
REVOKE ALL ON FUNCTION pz_localizar_credencial(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pz_localizar_credencial(text) TO pz_app;
RESET ROLE;

-- Titular (quem criou a conta, perfil advogado num escritório) também administra a equipe.
-- Com RLS forçado e sem BYPASSRLS, o migrador entra no contexto de cada tenant.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT id FROM tenant WHERE tipo <> 'plataforma' LOOP
    PERFORM set_config('app.tenant_id', t.id::text, true);
    INSERT INTO usuario_perfil (tenant_id, usuario_id, perfil)
      SELECT tenant_id, usuario_id, 'admin_escritorio' FROM usuario_perfil
       WHERE tenant_id = t.id AND perfil = 'advogado'
      ON CONFLICT DO NOTHING;
  END LOOP;
  PERFORM set_config('app.tenant_id', '', true);
END
$$;

-- O encerramento de conta (HU38) passa a apagar os convites (têm e-mail e nome).
CREATE OR REPLACE FUNCTION pz_efetivar_encerramento(p_tenant uuid) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
BEGIN
  PERFORM set_config('app.tenant_id', p_tenant::text, true);
  IF NOT EXISTS (
    SELECT 1 FROM encerramento_conta
     WHERE tenant_id = p_tenant AND cancelado_em IS NULL AND efetivado_em IS NULL
       AND efetivar_em <= now()
  ) THEN
    RAISE EXCEPTION 'encerramento de % não está vencido, foi cancelado ou já foi efetivado', p_tenant
      USING ERRCODE = 'check_violation';
  END IF;

  -- Dados de negócio: apagados.
  DELETE FROM relatorio WHERE tenant_id = p_tenant;
  DELETE FROM conferencia_painel WHERE tenant_id = p_tenant;
  DELETE FROM compromisso WHERE tenant_id = p_tenant;
  DELETE FROM prazo WHERE tenant_id = p_tenant;
  DELETE FROM publicacao_destinatario WHERE tenant_id = p_tenant;
  DELETE FROM alvo_assinante WHERE tenant_id = p_tenant;
  DELETE FROM processo WHERE tenant_id = p_tenant;
  DELETE FROM cliente WHERE tenant_id = p_tenant;
  DELETE FROM oab WHERE tenant_id = p_tenant;
  DELETE FROM advogado WHERE tenant_id = p_tenant;
  DELETE FROM preferencia_notificacao WHERE tenant_id = p_tenant;
  DELETE FROM destino_push WHERE tenant_id = p_tenant;
  DELETE FROM sessao_dispositivo WHERE tenant_id = p_tenant;
  DELETE FROM cliente_oauth WHERE tenant_id = p_tenant;
  DELETE FROM entrega_webhook WHERE tenant_id = p_tenant;
  DELETE FROM assinatura_webhook WHERE tenant_id = p_tenant;
  DELETE FROM convite_membro WHERE tenant_id = p_tenant;
  DELETE FROM usuario_perfil WHERE tenant_id = p_tenant;
  DELETE FROM exportacao_dados WHERE tenant_id = p_tenant;
  DELETE FROM evento_processado WHERE tenant_id = p_tenant;
  DELETE FROM evento_dominio WHERE tenant_id = p_tenant;

  -- Provas: mantidas até o fim da retenção, sem dado pessoal.
  UPDATE acesso SET ip = 'pseudonimizado', user_agent = 'pseudonimizado' WHERE tenant_id = p_tenant;
  UPDATE aceite_documento SET ip = 'pseudonimizado', user_agent = 'pseudonimizado' WHERE tenant_id = p_tenant;
  UPDATE notificacao SET destinatarios = '{}', dados = '{}'::jsonb WHERE tenant_id = p_tenant;
  UPDATE consentimento_canal SET destino = 'pseudonimizado' WHERE tenant_id = p_tenant;
  UPDATE auditoria_dado_pessoal SET valor = NULL, sal = NULL, pseudonimizado_em = now()
   WHERE tenant_id = p_tenant AND pseudonimizado_em IS NULL;
  UPDATE usuario
     SET nome = 'Usuário removido', email = 'removido-' || id || '@encerrado.invalid',
         senha_hash = NULL, totp_segredo_cifrado = NULL, totp_ativo_em = NULL,
         totp_ultimo_passo = NULL, codigos_recuperacao = '{}', email_verificado_em = NULL
   WHERE tenant_id = p_tenant;

  UPDATE tenant SET nome = 'Escritório encerrado', encerrado_em = now() WHERE id = p_tenant;
  UPDATE encerramento_conta SET efetivado_em = now() WHERE tenant_id = p_tenant;
END
$$;
