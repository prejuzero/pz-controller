-- Conferência de painel (HU36, PZ-215): processos sigilosos ou fora da cobertura automática pedem
-- conferência periódica no painel do tribunal, porque a intimação por portal vira ciência tácita
-- após 10 dias corridos (Lei 11.419, art. 5º, §3º). A periodicidade fica abaixo disso (1 a 9 dias).
ALTER TABLE "processo" ADD COLUMN "conferencia_a_cada_dias" INTEGER;
ALTER TABLE "processo" ADD CONSTRAINT "processo_conferencia_a_cada_dias"
  CHECK ("conferencia_a_cada_dias" IS NULL OR "conferencia_a_cada_dias" BETWEEN 1 AND 9);

-- Registro da conferência: prova, só inserção (sem UPDATE nem DELETE para a aplicação).
CREATE TABLE "conferencia_painel" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "processo_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "realizada_em" TIMESTAMPTZ(6) NOT NULL,
    "resultado" TEXT NOT NULL,
    "observacao" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conferencia_painel_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "conferencia_painel_resultado" CHECK ("resultado" IN ('sem-novidade', 'nova-intimacao')),
    CONSTRAINT "conferencia_painel_observacao" CHECK ("observacao" IS NULL OR length("observacao") <= 1000)
);
CREATE INDEX "conferencia_painel_tenant_id_processo_id_realizada_em_idx" ON "conferencia_painel"("tenant_id", "processo_id", "realizada_em" DESC);
ALTER TABLE "conferencia_painel" ADD CONSTRAINT "conferencia_painel_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conferencia_painel" ADD CONSTRAINT "conferencia_painel_tenant_id_processo_id_fkey" FOREIGN KEY ("tenant_id", "processo_id") REFERENCES "processo"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
SELECT pz_habilitar_rls('conferencia_painel');
REVOKE UPDATE, DELETE, TRUNCATE ON "conferencia_painel" FROM pz_app, pz_sistema, pz_leitura;

-- O encerramento de conta (HU38) passa a apagar as conferências do tenant (antes dos processos).
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
