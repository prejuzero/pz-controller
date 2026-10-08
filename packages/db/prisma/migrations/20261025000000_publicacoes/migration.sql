-- Publicações deduplicadas (HU18, ADR-014). Conteúdo global, imutável, particionado por mês e
-- legível pela aplicação só pela view `publicacao_do_tenant` (destinatários do tenant, RLS).
-- UNIQUE (fonte, hash) não cabe na tabela particionada sem a chave de partição: a deduplicação
-- global fica em `publicacao_chave`, gravada junto pela função de registro.

CREATE TABLE "publicacao_conteudo" (
    "id" UUID NOT NULL,
    "fonte" TEXT NOT NULL,
    "id_externo" TEXT NOT NULL,
    "hash_conteudo" TEXT NOT NULL,
    "data_disponibilizacao" DATE NOT NULL,
    -- Data considerada de publicação: só o motor de prazos calcula (HU14); até lá, nula.
    "data_publicacao" DATE,
    "numero_cnj" CHAR(20),
    "teor" TEXT NOT NULL,
    "teor_tsv" TSVECTOR GENERATED ALWAYS AS (to_tsvector('portugues_sem_acento'::regconfig, "teor")) STORED,
    "url_fonte" TEXT NOT NULL,
    "metadados" JSONB NOT NULL DEFAULT '{}',
    "adaptador_versao" TEXT NOT NULL,
    -- Prova: instante da captura, horário do banco.
    "capturado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publicacao_conteudo_pkey" PRIMARY KEY ("id", "capturado_em"),
    CONSTRAINT "publicacao_conteudo_hash" CHECK ("hash_conteudo" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "publicacao_conteudo_numero_cnj" CHECK ("numero_cnj" IS NULL OR "numero_cnj" ~ '^[0-9]{20}$')
) PARTITION BY RANGE ("capturado_em");
CREATE INDEX "publicacao_conteudo_teor_tsv_idx" ON "publicacao_conteudo" USING GIN ("teor_tsv");
CREATE INDEX "publicacao_conteudo_numero_cnj_idx" ON "publicacao_conteudo"("numero_cnj", "data_disponibilizacao");
SELECT partman.create_parent(
  p_parent_table := 'public.publicacao_conteudo',
  p_control := 'capturado_em',
  p_interval := '1 month',
  p_premake := 3
);

CREATE TABLE "publicacao_chave" (
    "fonte" TEXT NOT NULL,
    "hash_conteudo" TEXT NOT NULL,
    "conteudo_id" UUID NOT NULL,
    "capturado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "publicacao_chave_pkey" PRIMARY KEY ("fonte", "hash_conteudo")
);
ALTER TABLE "publicacao_chave" ADD CONSTRAINT "publicacao_chave_conteudo_fkey" FOREIGN KEY ("conteudo_id", "capturado_em") REFERENCES "publicacao_conteudo"("id", "capturado_em") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Conteúdo e chave são imutáveis e não têm acesso direto da aplicação.
REVOKE ALL ON "publicacao_conteudo", "publicacao_chave" FROM pz_app, pz_leitura;
GRANT SELECT ON "publicacao_conteudo", "publicacao_chave" TO pz_sistema;
CREATE FUNCTION pz_publicacao_imutavel() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  RAISE EXCEPTION '% é imutável (ADR-014): % não permitido', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$;
CREATE TRIGGER "publicacao_conteudo_imutavel" BEFORE UPDATE OR DELETE ON "publicacao_conteudo"
  FOR EACH ROW EXECUTE FUNCTION pz_publicacao_imutavel();
CREATE TRIGGER "publicacao_chave_imutavel" BEFORE UPDATE OR DELETE ON "publicacao_chave"
  FOR EACH ROW EXECUTE FUNCTION pz_publicacao_imutavel();

-- Destinatários por tenant (RLS): processo e OAB do próprio tenant (chaves compostas).
CREATE UNIQUE INDEX "processo_tenant_id_id_key" ON "processo"("tenant_id", "id");
CREATE UNIQUE INDEX "oab_tenant_id_id_key" ON "oab"("tenant_id", "id");
CREATE TABLE "publicacao_destinatario" (
    "tenant_id" UUID NOT NULL,
    "conteudo_id" UUID NOT NULL,
    "conteudo_capturado_em" TIMESTAMPTZ(6) NOT NULL,
    "processo_id" UUID,
    "oab_id" UUID,
    "recebida_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lida_em" TIMESTAMPTZ(6),
    "lida_por" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publicacao_destinatario_pkey" PRIMARY KEY ("tenant_id", "conteudo_id"),
    CONSTRAINT "publicacao_destinatario_leitura" CHECK (("lida_em" IS NULL) = ("lida_por" IS NULL))
);
CREATE INDEX "publicacao_destinatario_tenant_id_recebida_em_idx" ON "publicacao_destinatario"("tenant_id", "recebida_em");
CREATE INDEX "publicacao_destinatario_tenant_id_processo_id_idx" ON "publicacao_destinatario"("tenant_id", "processo_id");
ALTER TABLE "publicacao_destinatario" ADD CONSTRAINT "publicacao_destinatario_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publicacao_destinatario" ADD CONSTRAINT "publicacao_destinatario_conteudo_fkey" FOREIGN KEY ("conteudo_id", "conteudo_capturado_em") REFERENCES "publicacao_conteudo"("id", "capturado_em") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "publicacao_destinatario" ADD CONSTRAINT "publicacao_destinatario_processo_fkey" FOREIGN KEY ("tenant_id", "processo_id") REFERENCES "processo"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "publicacao_destinatario" ADD CONSTRAINT "publicacao_destinatario_oab_fkey" FOREIGN KEY ("tenant_id", "oab_id") REFERENCES "oab"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
SELECT pz_habilitar_rls('publicacao_destinatario');
REVOKE DELETE ON "publicacao_destinatario" FROM pz_app;

-- Leitura da aplicação: só o conteúdo que tem destinatário no tenant atual. A view roda com o
-- dono (que lê o conteúdo), e o RLS forçado do destinatário filtra pelo tenant.
CREATE VIEW "publicacao_do_tenant" WITH (security_barrier = true) AS
  SELECT d."tenant_id", d."conteudo_id", d."processo_id", d."oab_id", d."recebida_em",
         d."lida_em", d."lida_por", c."fonte", c."id_externo", c."hash_conteudo",
         c."data_disponibilizacao", c."data_publicacao", c."numero_cnj", c."teor", c."teor_tsv",
         c."url_fonte", c."metadados", c."capturado_em"
    FROM "publicacao_destinatario" d
    JOIN "publicacao_conteudo" c ON c."id" = d."conteudo_id" AND c."capturado_em" = d."conteudo_capturado_em";
GRANT SELECT ON "publicacao_do_tenant" TO pz_app, pz_leitura, pz_sistema;

-- Registro do conteúdo (ingestão): devolve o existente (fonte + hash) ou grava o novo, com
-- trava por chave contra corrida. Única via de escrita do conteúdo pela aplicação.
CREATE FUNCTION pz_registrar_publicacao(
  p_id uuid, p_fonte text, p_id_externo text, p_hash text, p_data_disponibilizacao date,
  p_numero_cnj text, p_teor text, p_url_fonte text, p_metadados jsonb, p_adaptador_versao text
) RETURNS TABLE (conteudo_id uuid, capturado_em timestamptz, novo boolean)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  -- Milissegundos: o instante volta à aplicação (Date do JavaScript) e compõe a chave.
  v_instante timestamptz := date_trunc('milliseconds', now());
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('publicacao:' || p_fonte || ':' || p_hash, 0));
  RETURN QUERY SELECT k.conteudo_id, k.capturado_em, false
    FROM publicacao_chave k WHERE k.fonte = p_fonte AND k.hash_conteudo = p_hash;
  IF FOUND THEN RETURN; END IF;
  INSERT INTO publicacao_conteudo (id, fonte, id_externo, hash_conteudo, data_disponibilizacao,
      numero_cnj, teor, url_fonte, metadados, adaptador_versao, capturado_em)
    VALUES (p_id, p_fonte, p_id_externo, p_hash, p_data_disponibilizacao, p_numero_cnj, p_teor,
      p_url_fonte, COALESCE(p_metadados, '{}'::jsonb), p_adaptador_versao, v_instante);
  INSERT INTO publicacao_chave (fonte, hash_conteudo, conteudo_id, capturado_em)
    VALUES (p_fonte, p_hash, p_id, v_instante);
  RETURN QUERY SELECT p_id, v_instante, true;
END
$$;
REVOKE ALL ON FUNCTION pz_registrar_publicacao(uuid, text, text, text, date, text, text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pz_registrar_publicacao(uuid, text, text, text, date, text, text, text, jsonb, text) TO pz_app, pz_sistema;

-- O encerramento de conta (HU38) passa a apagar os destinatários do tenant.
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
