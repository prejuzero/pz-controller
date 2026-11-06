-- Clientes OAuth 2.1 de integradores (HU49, ADR-015): Client Credentials. O cliente age em nome
-- do usuário que o registrou, limitado aos escopos (permissões de leitura do catálogo, HU07). O
-- segredo é guardado só como hash (SHA-256 de 256 bits aleatórios, CLAUDE.md seção 14).
CREATE TABLE "cliente_oauth" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "segredo_hash" TEXT NOT NULL,
    "escopos" TEXT[] NOT NULL,
    "ultimo_uso" TIMESTAMPTZ(6),
    "revogado_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cliente_oauth_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cliente_oauth_escopos" CHECK (cardinality("escopos") > 0)
);

CREATE INDEX "cliente_oauth_tenant_id_idx" ON "cliente_oauth"("tenant_id");

ALTER TABLE "cliente_oauth" ADD CONSTRAINT "cliente_oauth_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cliente_oauth" ADD CONSTRAINT "cliente_oauth_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

SELECT pz_habilitar_rls('cliente_oauth');
-- Revogar é estado (revogado_em), nunca exclusão: a trilha aponta para o cliente.
REVOKE DELETE ON "cliente_oauth" FROM pz_app, pz_sistema;

-- O endpoint de token (público) localiza o cliente antes de saber o tenant, sem BYPASSRLS na
-- api: como no login, uma função do papel pz_credencial devolve só o necessário de UM cliente.
GRANT SELECT ("id", "tenant_id", "usuario_id", "segredo_hash", "escopos", "revogado_em") ON "cliente_oauth" TO pz_credencial;
CREATE POLICY localizar_cliente_oauth ON "cliente_oauth" FOR SELECT TO pz_credencial USING (true);

SET ROLE pz_credencial;
CREATE FUNCTION pz_localizar_cliente_oauth(p_id uuid)
  RETURNS TABLE (
    tenant_id uuid, usuario_id uuid, segredo_hash text, escopos text[], revogado boolean,
    tenant_suspenso boolean
  )
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT c.tenant_id, c.usuario_id, c.segredo_hash, c.escopos, c.revogado_em IS NOT NULL,
               t.suspenso_em IS NOT NULL
          FROM cliente_oauth c JOIN tenant t ON t.id = c.tenant_id
         WHERE c.id = p_id $$;
REVOKE ALL ON FUNCTION pz_localizar_cliente_oauth(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pz_localizar_cliente_oauth(uuid) TO pz_app;
RESET ROLE;

-- Quem registra e revoga os clientes do escritório: espelha PERFIS_PADRAO
-- (modules/identidade/domain/perfis.ts).
INSERT INTO "perfil_permissao" ("perfil", "permissao") VALUES
  ('advogado', 'integracoes:gerir'),
  ('admin_escritorio', 'integracoes:gerir');

-- O encerramento de conta (HU38) passa a apagar os clientes OAuth do tenant.
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
