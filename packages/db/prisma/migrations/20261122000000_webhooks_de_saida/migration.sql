-- Webhooks de saída (HU49, ADR-023): o escritório assina eventos públicos e recebe um POST
-- assinado (HMAC-SHA256) no endereço dele. O segredo da assinatura precisa ser lido para assinar:
-- fica cifrado (ADR-021), nunca em claro.
CREATE TABLE "assinatura_webhook" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "eventos" TEXT[] NOT NULL,
    "segredo_cifrado" TEXT NOT NULL,
    "criado_por" UUID NOT NULL,
    "desativada_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assinatura_webhook_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assinatura_webhook_eventos" CHECK (cardinality("eventos") > 0)
);

CREATE UNIQUE INDEX "assinatura_webhook_tenant_id_id_key" ON "assinatura_webhook"("tenant_id", "id");

ALTER TABLE "assinatura_webhook" ADD CONSTRAINT "assinatura_webhook_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

SELECT pz_habilitar_rls('assinatura_webhook');
-- Desativar é estado: as entregas antigas continuam apontando para a assinatura.
REVOKE DELETE ON "assinatura_webhook" FROM pz_app, pz_sistema;

-- Uma entrega por (assinatura, evento): repetir o evento não envia duas vezes.
CREATE TABLE "entrega_webhook" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "assinatura_id" UUID NOT NULL,
    "evento_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "ocorrido_em" TIMESTAMPTZ(6) NOT NULL,
    "dados" JSONB NOT NULL,
    "situacao" TEXT NOT NULL DEFAULT 'pendente',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "ultimo_status" INTEGER,
    "ultimo_erro" TEXT,
    "entregue_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entrega_webhook_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "entrega_webhook_situacao" CHECK ("situacao" IN ('pendente', 'entregue', 'falhou'))
);

CREATE UNIQUE INDEX "entrega_webhook_assinatura_id_evento_id_key" ON "entrega_webhook"("assinatura_id", "evento_id");
CREATE INDEX "entrega_webhook_tenant_id_criado_em_idx" ON "entrega_webhook"("tenant_id", "criado_em" DESC);

ALTER TABLE "entrega_webhook" ADD CONSTRAINT "entrega_webhook_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "entrega_webhook" ADD CONSTRAINT "entrega_webhook_tenant_id_assinatura_id_fkey" FOREIGN KEY ("tenant_id", "assinatura_id") REFERENCES "assinatura_webhook"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

SELECT pz_habilitar_rls('entrega_webhook');
REVOKE DELETE ON "entrega_webhook" FROM pz_app, pz_sistema;

-- O encerramento de conta (HU38) passa a apagar as assinaturas e entregas do tenant.
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
