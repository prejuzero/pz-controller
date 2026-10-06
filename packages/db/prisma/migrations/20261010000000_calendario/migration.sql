-- Calendário forense (HU13, ADR-003, ADR-007). Dois níveis de dado:
-- * evento_calendario: global, sem tenant_id (como tabela_prazo), mantido pelo curador no tenant
--   plataforma; nasce rascunho e só vale aprovado por outra pessoa (quatro olhos, CLAUDE.md 4.3).
-- * feriado_local: do próprio escritório, com tenant_id e RLS (CLAUDE.md, seção 9).
-- Nenhuma linha é apagada: correção é revogação, que fica registrada. Sábados e domingos não estão
-- aqui: são regra do motor (CPC, art. 216).

-- CreateEnum
CREATE TYPE "abrangencia_calendario" AS ENUM ('nacional', 'uf', 'municipio', 'tribunal', 'comarca');
CREATE TYPE "tipo_evento_calendario" AS ENUM ('feriado', 'recesso', 'portaria', 'indisponibilidade');
CREATE TYPE "status_evento_calendario" AS ENUM ('rascunho', 'aprovado');

-- CreateTable
CREATE TABLE "evento_calendario" (
    "id" UUID NOT NULL,
    "abrangencia" "abrangencia_calendario" NOT NULL,
    "uf" CHAR(2),
    "municipio_ibge" CHAR(7),
    "tribunal" TEXT,
    "comarca" TEXT,
    "tipo" "tipo_evento_calendario" NOT NULL,
    "data_inicio" DATE NOT NULL,
    "data_fim" DATE NOT NULL,
    "descricao" TEXT NOT NULL,
    "ato_normativo" TEXT NOT NULL,
    "url_ato" TEXT NOT NULL,
    "status" "status_evento_calendario" NOT NULL,
    "proposto_por" UUID NOT NULL,
    "proposto_em" TIMESTAMPTZ(6) NOT NULL,
    "aprovado_por" UUID,
    "aprovado_em" TIMESTAMPTZ(6),
    "revogado_por" UUID,
    "revogado_em" TIMESTAMPTZ(6),
    "motivo_revogacao" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evento_calendario_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "evento_calendario_periodo" CHECK ("data_fim" >= "data_inicio"),
    CONSTRAINT "evento_calendario_jurisdicao" CHECK (
      ("abrangencia" = 'nacional' AND "uf" IS NULL AND "municipio_ibge" IS NULL AND "tribunal" IS NULL AND "comarca" IS NULL)
      OR ("abrangencia" = 'uf' AND "uf" IS NOT NULL AND "municipio_ibge" IS NULL AND "tribunal" IS NULL AND "comarca" IS NULL)
      OR ("abrangencia" = 'municipio' AND "uf" IS NOT NULL AND "municipio_ibge" IS NOT NULL AND "tribunal" IS NULL AND "comarca" IS NULL)
      OR ("abrangencia" = 'tribunal' AND "uf" IS NULL AND "municipio_ibge" IS NULL AND "tribunal" IS NOT NULL AND "comarca" IS NULL)
      OR ("abrangencia" = 'comarca' AND "uf" IS NULL AND "municipio_ibge" IS NULL AND "tribunal" IS NOT NULL AND "comarca" IS NOT NULL)
    ),
    CONSTRAINT "evento_calendario_aprovacao" CHECK (
      ("status" = 'rascunho' AND "aprovado_por" IS NULL AND "aprovado_em" IS NULL)
      OR ("status" = 'aprovado' AND "aprovado_por" IS NOT NULL AND "aprovado_em" IS NOT NULL
          AND "aprovado_por" <> "proposto_por")
    ),
    CONSTRAINT "evento_calendario_revogacao" CHECK (
      ("revogado_por" IS NULL AND "revogado_em" IS NULL AND "motivo_revogacao" IS NULL)
      OR ("status" = 'aprovado' AND "revogado_por" IS NOT NULL AND "revogado_em" IS NOT NULL
          AND "motivo_revogacao" IS NOT NULL)
    )
);

-- CreateTable
CREATE TABLE "feriado_local" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "abrangencia" "abrangencia_calendario" NOT NULL,
    "uf" CHAR(2),
    "municipio_ibge" CHAR(7),
    "tribunal" TEXT,
    "comarca" TEXT,
    "tipo" "tipo_evento_calendario" NOT NULL,
    "data_inicio" DATE NOT NULL,
    "data_fim" DATE NOT NULL,
    "descricao" TEXT NOT NULL,
    "ato_normativo" TEXT NOT NULL,
    "url_ato" TEXT NOT NULL,
    "cadastrado_por" UUID NOT NULL,
    "cadastrado_em" TIMESTAMPTZ(6) NOT NULL,
    "revogado_por" UUID,
    "revogado_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feriado_local_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "feriado_local_periodo" CHECK ("data_fim" >= "data_inicio"),
    -- O escritório não cadastra calendário nacional: esse é só do curador.
    CONSTRAINT "feriado_local_jurisdicao" CHECK (
      ("abrangencia" = 'uf' AND "uf" IS NOT NULL AND "municipio_ibge" IS NULL AND "tribunal" IS NULL AND "comarca" IS NULL)
      OR ("abrangencia" = 'municipio' AND "uf" IS NOT NULL AND "municipio_ibge" IS NOT NULL AND "tribunal" IS NULL AND "comarca" IS NULL)
      OR ("abrangencia" = 'tribunal' AND "uf" IS NULL AND "municipio_ibge" IS NULL AND "tribunal" IS NOT NULL AND "comarca" IS NULL)
      OR ("abrangencia" = 'comarca' AND "uf" IS NULL AND "municipio_ibge" IS NULL AND "tribunal" IS NOT NULL AND "comarca" IS NOT NULL)
    ),
    CONSTRAINT "feriado_local_revogacao" CHECK (("revogado_por" IS NULL) = ("revogado_em" IS NULL))
);

-- CreateIndex
CREATE INDEX "evento_calendario_abrangencia_data_inicio_idx" ON "evento_calendario"("abrangencia", "data_inicio");
CREATE INDEX "evento_calendario_tribunal_idx" ON "evento_calendario"("tribunal");
CREATE INDEX "feriado_local_tenant_id_data_inicio_idx" ON "feriado_local"("tenant_id", "data_inicio");

-- AddForeignKey
ALTER TABLE "feriado_local" ADD CONSTRAINT "feriado_local_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Só duas transições alteram uma linha global, sem mexer no conteúdo revisado:
-- rascunho → aprovado e aprovado → revogado. Nada é apagado.
CREATE FUNCTION pz_evento_calendario_imutavel() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (NEW.id, NEW.abrangencia, NEW.uf, NEW.municipio_ibge, NEW.tribunal, NEW.comarca, NEW.tipo,
          NEW.data_inicio, NEW.data_fim, NEW.descricao, NEW.ato_normativo, NEW.url_ato,
          NEW.proposto_por, NEW.proposto_em, NEW.criado_em)
         IS NOT DISTINCT FROM
         (OLD.id, OLD.abrangencia, OLD.uf, OLD.municipio_ibge, OLD.tribunal, OLD.comarca, OLD.tipo,
          OLD.data_inicio, OLD.data_fim, OLD.descricao, OLD.ato_normativo, OLD.url_ato,
          OLD.proposto_por, OLD.proposto_em, OLD.criado_em)
     AND (
       (OLD.status = 'rascunho' AND NEW.status = 'aprovado' AND NEW.revogado_em IS NULL)
       OR (OLD.status = 'aprovado' AND NEW.status = 'aprovado' AND OLD.revogado_em IS NULL
           AND NEW.revogado_em IS NOT NULL
           AND (NEW.aprovado_por, NEW.aprovado_em) IS NOT DISTINCT FROM (OLD.aprovado_por, OLD.aprovado_em))
     ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'evento_calendario: % não permitido (imutável; só aprovação ou revogação, sem alterar o conteúdo)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$;

CREATE TRIGGER "evento_calendario_imutavel" BEFORE UPDATE OR DELETE ON "evento_calendario"
  FOR EACH ROW EXECUTE FUNCTION pz_evento_calendario_imutavel();

-- No local, a única alteração é a revogação.
CREATE FUNCTION pz_feriado_local_imutavel() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.revogado_em IS NULL AND NEW.revogado_em IS NOT NULL
     AND (NEW.id, NEW.tenant_id, NEW.abrangencia, NEW.uf, NEW.municipio_ibge, NEW.tribunal,
          NEW.comarca, NEW.tipo, NEW.data_inicio, NEW.data_fim, NEW.descricao, NEW.ato_normativo,
          NEW.url_ato, NEW.cadastrado_por, NEW.cadastrado_em, NEW.criado_em)
         IS NOT DISTINCT FROM
         (OLD.id, OLD.tenant_id, OLD.abrangencia, OLD.uf, OLD.municipio_ibge, OLD.tribunal,
          OLD.comarca, OLD.tipo, OLD.data_inicio, OLD.data_fim, OLD.descricao, OLD.ato_normativo,
          OLD.url_ato, OLD.cadastrado_por, OLD.cadastrado_em, OLD.criado_em) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'feriado_local: % não permitido (imutável; só revogação, sem alterar o conteúdo)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$;

CREATE TRIGGER "feriado_local_imutavel" BEFORE UPDATE OR DELETE ON "feriado_local"
  FOR EACH ROW EXECUTE FUNCTION pz_feriado_local_imutavel();

-- Global (ADR-003): a api lê e o curador escreve pela transação do tenant plataforma.
GRANT SELECT, INSERT, UPDATE ON "evento_calendario" TO pz_app, pz_sistema;
GRANT SELECT ON "evento_calendario" TO pz_leitura;

-- Isolamento por tenant (ADR-003); DELETE nunca, nem pela aplicação.
SELECT pz_habilitar_rls('feriado_local');
REVOKE DELETE ON "feriado_local" FROM pz_app, pz_sistema;
