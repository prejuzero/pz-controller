-- Feed privado da agenda (HU50, RF55; decisões do usuário em 09/11/2026): a agenda pessoal
-- (Google, Apple, Outlook) assina um endereço com token. Só o hash do token fica no banco; um
-- feed ativo por usuário; revogar é estado.
CREATE TABLE "feed_agenda" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "ultimo_acesso" TIMESTAMPTZ(6),
    "revogado_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_agenda_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "feed_agenda_token_hash" CHECK ("token_hash" ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "feed_agenda_token_hash_key" ON "feed_agenda"("token_hash");
CREATE UNIQUE INDEX "feed_agenda_ativo_key" ON "feed_agenda"("tenant_id", "usuario_id")
  WHERE "revogado_em" IS NULL;
ALTER TABLE "feed_agenda" ADD CONSTRAINT "feed_agenda_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "feed_agenda" ADD CONSTRAINT "feed_agenda_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
SELECT pz_habilitar_rls('feed_agenda');
REVOKE DELETE ON "feed_agenda" FROM pz_app, pz_sistema;

-- A agenda chega sem sessão: como no convite (HU41), uma função do papel pz_credencial devolve
-- só o necessário de UM feed, pelo hash do token. A api segue sem BYPASSRLS.
GRANT SELECT ("id", "tenant_id", "usuario_id", "token_hash", "revogado_em") ON "feed_agenda" TO pz_credencial;
CREATE POLICY localizar_feed ON "feed_agenda" FOR SELECT TO pz_credencial USING (true);

SET ROLE pz_credencial;
CREATE FUNCTION pz_localizar_feed_agenda(p_hash text)
  RETURNS TABLE (id uuid, tenant_id uuid, usuario_id uuid, ativo boolean)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT f.id, f.tenant_id, f.usuario_id,
               f.revogado_em IS NULL AND t.suspenso_em IS NULL AND u.desativado_em IS NULL
          FROM feed_agenda f
          JOIN tenant t ON t.id = f.tenant_id
          JOIN usuario u ON u.id = f.usuario_id
         WHERE f.token_hash = p_hash $$;
REVOKE ALL ON FUNCTION pz_localizar_feed_agenda(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pz_localizar_feed_agenda(text) TO pz_app;
RESET ROLE;

-- O encerramento de conta (HU38) passa a apagar os feeds.
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
  DELETE FROM importacao_processo WHERE tenant_id = p_tenant;
  DELETE FROM nome_monitorado WHERE tenant_id = p_tenant;
  DELETE FROM feed_agenda WHERE tenant_id = p_tenant;
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
