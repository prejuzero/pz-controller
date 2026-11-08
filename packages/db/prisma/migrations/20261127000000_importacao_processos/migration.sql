-- Importação de processos em lote por CSV (HU42, RF04; decisões do usuário em 08/11/2026): a
-- prévia valida sem gravar; o pedido guarda as linhas válidas e o worker cadastra os processos.

CREATE TABLE "importacao_processo" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "solicitada_por" UUID NOT NULL,
    -- Linhas já validadas: [{numeroCnj, orgao, comarca, sigiloso}].
    "linhas" JSONB NOT NULL,
    "situacao" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "criados" INTEGER,
    "ja_existiam" INTEGER,
    "solicitada_em" TIMESTAMPTZ(6) NOT NULL,
    "concluida_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "importacao_processo_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "importacao_processo_situacao_check" CHECK ("situacao" IN ('pendente', 'concluida')),
    CONSTRAINT "importacao_processo_concluida_completa" CHECK (
      "situacao" = 'pendente'
      OR ("concluida_em" IS NOT NULL AND "criados" IS NOT NULL AND "ja_existiam" IS NOT NULL)
    )
);

CREATE INDEX "importacao_processo_tenant_id_idx" ON "importacao_processo"("tenant_id");

ALTER TABLE "importacao_processo" ADD CONSTRAINT "importacao_processo_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

SELECT pz_habilitar_rls('importacao_processo');
REVOKE DELETE ON "importacao_processo" FROM pz_app, pz_sistema;

-- O encerramento de conta (HU38) passa a apagar as importações (números de processo).
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
