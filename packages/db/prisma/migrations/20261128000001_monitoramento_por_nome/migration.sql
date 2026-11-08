-- Monitoramento por nome do escritório (HU42, RF05; decisões do usuário em 08/11/2026): nomes
-- cadastrados pelo escritório viram alvos da captura; o que chega só pelo nome espera o advogado
-- conferir (homônimos), sem processo nem prazo até a confirmação.

-- Nome canônico: espaços simples e maiúsculas (valorDoNome, módulo captura).
ALTER TABLE "alvo_monitoramento" DROP CONSTRAINT "alvo_monitoramento_valor";
ALTER TABLE "alvo_monitoramento" ADD CONSTRAINT "alvo_monitoramento_valor" CHECK (
  ("tipo" = 'oab' AND "valor" ~ '^[0-9]{1,8}/[A-Z]{2}$')
  OR ("tipo" = 'processo' AND "valor" ~ '^[0-9]{20}$')
  OR ("tipo" = 'nome' AND char_length("valor") BETWEEN 5 AND 150
      AND "valor" = upper("valor") AND "valor" = btrim("valor") AND "valor" !~ '\s{2}')
);

CREATE TABLE "nome_monitorado" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    -- Como o escritório digitou; "valor" é o canônico, igual ao do alvo.
    "nome" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "criado_por" UUID NOT NULL,
    "removido_em" TIMESTAMPTZ(6),
    "removido_por" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nome_monitorado_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "nome_monitorado_valor" CHECK (char_length("valor") BETWEEN 5 AND 150),
    CONSTRAINT "nome_monitorado_remocao" CHECK (("removido_em" IS NULL) = ("removido_por" IS NULL))
);
CREATE UNIQUE INDEX "nome_monitorado_ativo_key" ON "nome_monitorado"("tenant_id", "valor")
  WHERE "removido_em" IS NULL;
ALTER TABLE "nome_monitorado" ADD CONSTRAINT "nome_monitorado_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
SELECT pz_habilitar_rls('nome_monitorado');
REVOKE DELETE ON "nome_monitorado" FROM pz_app, pz_sistema;

-- Conferência da publicação capturada só pelo nome: nula nas demais.
ALTER TABLE "publicacao_destinatario"
  ADD COLUMN "conferencia" TEXT,
  ADD COLUMN "conferida_em" TIMESTAMPTZ(6),
  ADD COLUMN "conferida_por" UUID,
  ADD CONSTRAINT "publicacao_destinatario_conferencia" CHECK (
    "conferencia" IS NULL OR "conferencia" IN ('pendente', 'confirmada', 'descartada')
  ),
  ADD CONSTRAINT "publicacao_destinatario_conferida" CHECK (
    ("conferencia" IN ('confirmada', 'descartada')) = ("conferida_em" IS NOT NULL)
  );
CREATE INDEX "publicacao_destinatario_conferencia_pendente_idx" ON "publicacao_destinatario"("tenant_id")
  WHERE "conferencia" = 'pendente';

CREATE OR REPLACE VIEW "publicacao_do_tenant" WITH (security_barrier = true) AS
  SELECT d."tenant_id", d."conteudo_id", d."processo_id", d."oab_id", d."recebida_em",
         d."lida_em", d."lida_por", c."fonte", c."id_externo", c."hash_conteudo",
         c."data_disponibilizacao", c."data_publicacao", c."numero_cnj", c."teor", c."teor_tsv",
         c."url_fonte", c."metadados", c."capturado_em", d."conferencia"
    FROM "publicacao_destinatario" d
    JOIN "publicacao_conteudo" c ON c."id" = d."conteudo_id" AND c."capturado_em" = d."conteudo_capturado_em";

-- O encerramento de conta (HU38) passa a apagar os nomes monitorados.
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
