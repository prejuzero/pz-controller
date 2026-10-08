-- Reverte 20261025000000_publicacoes (só em desenvolvimento).
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
DROP FUNCTION IF EXISTS pz_registrar_publicacao(uuid, text, text, text, date, text, text, text, jsonb, text);
DROP VIEW IF EXISTS "publicacao_do_tenant";
DROP TABLE IF EXISTS "publicacao_destinatario";
DROP INDEX IF EXISTS "oab_tenant_id_id_key";
DROP INDEX IF EXISTS "processo_tenant_id_id_key";
DROP TABLE IF EXISTS "publicacao_chave";
DROP TABLE IF EXISTS "publicacao_conteudo" CASCADE;
DELETE FROM partman.part_config WHERE parent_table = 'public.publicacao_conteudo';
DROP TABLE IF EXISTS partman.template_public_publicacao_conteudo;
DROP FUNCTION IF EXISTS pz_publicacao_imutavel();
