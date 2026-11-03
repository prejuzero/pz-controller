-- Relatórios e exportação (HU29, PZ-187): pedido por usuário, gerado no worker; o arquivo fica no
-- armazenamento e sai por link assinado até `expira_em` (24 h). Filtros guardados como pedidos.
CREATE TABLE "relatorio" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "formato" TEXT NOT NULL,
    "filtros" JSONB NOT NULL DEFAULT '{}',
    "situacao" TEXT NOT NULL DEFAULT 'pendente',
    "linhas" INTEGER,
    "solicitado_em" TIMESTAMPTZ(6) NOT NULL,
    "concluido_em" TIMESTAMPTZ(6),
    "expira_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relatorio_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "relatorio_tipo" CHECK ("tipo" IN ('agenda', 'busca-prazos', 'busca-publicacoes')),
    CONSTRAINT "relatorio_formato" CHECK ("formato" IN ('pdf', 'xlsx')),
    CONSTRAINT "relatorio_situacao" CHECK ("situacao" IN ('pendente', 'concluido', 'falhou')),
    CONSTRAINT "relatorio_conclusao" CHECK (
      ("situacao" = 'concluido') = ("concluido_em" IS NOT NULL AND "expira_em" IS NOT NULL AND "linhas" IS NOT NULL)
    )
);
CREATE INDEX "relatorio_tenant_id_usuario_id_solicitado_em_idx" ON "relatorio"("tenant_id", "usuario_id", "solicitado_em" DESC);
ALTER TABLE "relatorio" ADD CONSTRAINT "relatorio_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
SELECT pz_habilitar_rls('relatorio');

-- O encerramento de conta (HU38) passa a apagar os relatórios do tenant.
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
