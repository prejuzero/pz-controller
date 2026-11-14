-- Ramo pela classe processual do DJEN (decisão do usuário em 14/11/2026). Dados globais, sem
-- tenant_id (ADR-003): classes que chegaram nas publicações e a correspondência classe → ramo,
-- proposta e aprovada pela curadoria (CLAUDE.md, seção 4.3). Sem ramo, o prazo fica "a confirmar".

-- Classes vistas nas publicações (forma canônica): o worker recalcula a partir de
-- publicacao_conteudo, como sistema; a curadoria só lê. Não há dado pessoal aqui.
CREATE TABLE "classe_processual_vista" (
    "classe" TEXT NOT NULL,
    "ocorrencias" INTEGER NOT NULL,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classe_processual_vista_pkey" PRIMARY KEY ("classe"),
    CONSTRAINT "classe_processual_vista_ocorrencias" CHECK ("ocorrencias" >= 0)
);

-- Correspondência classe → ramo, versionada: só de inserção, e a versão aprovada nunca muda.
CREATE TABLE "ramo_da_classe" (
    "id" UUID NOT NULL,
    "classe" TEXT NOT NULL,
    "ramo" "ramo_processual" NOT NULL,
    "versao" INTEGER NOT NULL,
    "fundamento" TEXT NOT NULL,
    "fonte_url" TEXT NOT NULL,
    "status" "status_tabela_prazo" NOT NULL,
    "proposto_por" UUID NOT NULL,
    "proposto_em" TIMESTAMPTZ(6) NOT NULL,
    "aprovado_por" UUID,
    "aprovado_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ramo_da_classe_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ramo_da_classe_versao_positiva" CHECK ("versao" > 0),
    CONSTRAINT "ramo_da_classe_classe_canonica" CHECK ("classe" = upper("classe") AND length("classe") BETWEEN 3 AND 200),
    CONSTRAINT "ramo_da_classe_aprovacao" CHECK (
      ("status" = 'rascunho' AND "aprovado_por" IS NULL AND "aprovado_em" IS NULL)
      OR ("status" = 'aprovado' AND "aprovado_por" IS NOT NULL AND "aprovado_em" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "ramo_da_classe_classe_versao_key" ON "ramo_da_classe"("classe", "versao");

-- Só a transição rascunho → aprovado altera uma linha, sem mexer no conteúdo proposto.
CREATE FUNCTION pz_ramo_da_classe_imutavel() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'rascunho' AND NEW.status = 'aprovado'
     AND (NEW.id, NEW.classe, NEW.ramo, NEW.versao, NEW.fundamento, NEW.fonte_url,
          NEW.proposto_por, NEW.proposto_em, NEW.criado_em)
         IS NOT DISTINCT FROM
         (OLD.id, OLD.classe, OLD.ramo, OLD.versao, OLD.fundamento, OLD.fonte_url,
          OLD.proposto_por, OLD.proposto_em, OLD.criado_em) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'ramo_da_classe: % não permitido (versão aprovada é imutável; altere criando nova versão)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$;

CREATE TRIGGER "ramo_da_classe_imutavel" BEFORE UPDATE OR DELETE ON "ramo_da_classe"
  FOR EACH ROW EXECUTE FUNCTION pz_ramo_da_classe_imutavel();

GRANT SELECT ON "classe_processual_vista" TO pz_app, pz_leitura;
GRANT SELECT, INSERT, UPDATE, DELETE ON "classe_processual_vista" TO pz_sistema;
GRANT SELECT, INSERT, UPDATE ON "ramo_da_classe" TO pz_app, pz_sistema;
GRANT SELECT ON "ramo_da_classe" TO pz_leitura;
