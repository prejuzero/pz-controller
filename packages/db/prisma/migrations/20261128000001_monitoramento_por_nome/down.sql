-- Reverte 20261128000001_monitoramento_por_nome. Alvos e assinaturas por nome são apagados
-- (a assinatura tem RLS forçado: o migrador entra no contexto de cada tenant).
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

DROP VIEW "publicacao_do_tenant";
CREATE VIEW "publicacao_do_tenant" WITH (security_barrier = true) AS
  SELECT d."tenant_id", d."conteudo_id", d."processo_id", d."oab_id", d."recebida_em",
         d."lida_em", d."lida_por", c."fonte", c."id_externo", c."hash_conteudo",
         c."data_disponibilizacao", c."data_publicacao", c."numero_cnj", c."teor", c."teor_tsv",
         c."url_fonte", c."metadados", c."capturado_em"
    FROM "publicacao_destinatario" d
    JOIN "publicacao_conteudo" c ON c."id" = d."conteudo_id" AND c."capturado_em" = d."conteudo_capturado_em";
GRANT SELECT ON "publicacao_do_tenant" TO pz_app, pz_leitura, pz_sistema;

DROP INDEX "publicacao_destinatario_conferencia_pendente_idx";
ALTER TABLE "publicacao_destinatario"
  DROP CONSTRAINT "publicacao_destinatario_conferida",
  DROP CONSTRAINT "publicacao_destinatario_conferencia",
  DROP COLUMN "conferida_por",
  DROP COLUMN "conferida_em",
  DROP COLUMN "conferencia";

DROP TABLE "nome_monitorado";

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT id FROM tenant LOOP
    PERFORM set_config('app.tenant_id', t.id::text, true);
    DELETE FROM alvo_assinante
     WHERE tenant_id = t.id
       AND alvo_id IN (SELECT id FROM alvo_monitoramento WHERE tipo = 'nome');
  END LOOP;
  PERFORM set_config('app.tenant_id', '', true);
END
$$;
DELETE FROM "alvo_monitoramento" WHERE "tipo" = 'nome';
ALTER TABLE "alvo_monitoramento" DROP CONSTRAINT "alvo_monitoramento_valor";
ALTER TABLE "alvo_monitoramento" ADD CONSTRAINT "alvo_monitoramento_valor" CHECK (
  ("tipo" = 'oab' AND "valor" ~ '^[0-9]{1,8}/[A-Z]{2}$')
  OR ("tipo" = 'processo' AND "valor" ~ '^[0-9]{20}$')
);
