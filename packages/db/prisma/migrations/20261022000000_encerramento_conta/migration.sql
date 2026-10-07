-- Encerramento de conta do escritório (HU38, LGPD): carência de 30 dias, depois exclusão dos
-- dados de negócio; provas (aceites, notificações, acessos) ficam pseudonimizadas até o fim da
-- retenção (decisões do produto de 07/10/2026; ADR-018 para a trilha).
CREATE TABLE "encerramento_conta" (
    "tenant_id" UUID NOT NULL,
    "solicitado_por" UUID NOT NULL,
    "solicitado_em" TIMESTAMPTZ(6) NOT NULL,
    "efetivar_em" TIMESTAMPTZ(6) NOT NULL,
    "cancelado_em" TIMESTAMPTZ(6),
    "efetivado_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "encerramento_conta_pkey" PRIMARY KEY ("tenant_id"),
    CONSTRAINT "encerramento_conta_carencia" CHECK ("efetivar_em" > "solicitado_em"),
    CONSTRAINT "encerramento_conta_desfecho" CHECK ("cancelado_em" IS NULL OR "efetivado_em" IS NULL)
);
ALTER TABLE "encerramento_conta" ADD CONSTRAINT "encerramento_conta_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
SELECT pz_habilitar_rls('encerramento_conta');
REVOKE DELETE ON "encerramento_conta" FROM pz_app, pz_sistema;

ALTER TABLE "tenant" ADD COLUMN "encerrado_em" TIMESTAMPTZ(6);

INSERT INTO "perfil_permissao" ("perfil", "permissao") VALUES
  ('admin_escritorio', 'escritorio:encerrar'),
  ('advogado', 'escritorio:encerrar');

-- Efetivação: única via para apagar dados que a aplicação não pode apagar. SECURITY DEFINER
-- (dono das tabelas, sob RLS forçado no tenant), só para o papel sistema e só com encerramento
-- vencido e não cancelado. A ordem respeita as chaves estrangeiras.
CREATE FUNCTION pz_efetivar_encerramento(p_tenant uuid) RETURNS void
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
REVOKE ALL ON FUNCTION pz_efetivar_encerramento(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pz_efetivar_encerramento(uuid) TO pz_sistema;
