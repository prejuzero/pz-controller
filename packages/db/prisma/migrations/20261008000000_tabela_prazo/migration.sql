-- Taxonomia de atos e tabela de prazos versionada (HU15, ADR-003, ADR-007). Dados globais, sem
-- tenant_id: mantidos pelo curador e lidos por todos os escritórios. Versão aprovada nunca muda;
-- alteração é uma nova versão. A aprovação exige outra pessoa (quatro olhos).

-- Tenant interno do PrejuZero (curador, administração): a trilha e os eventos das mudanças em
-- dados globais ficam na cadeia dele.
ALTER TYPE "tipo_tenant" ADD VALUE 'plataforma';

-- CreateEnum
CREATE TYPE "ramo_processual" AS ENUM ('civel', 'juizados', 'trabalhista', 'penal');
CREATE TYPE "unidade_prazo" AS ENUM ('dias', 'horas', 'meses', 'anos');
CREATE TYPE "status_tabela_prazo" AS ENUM ('rascunho', 'aprovado');

-- CreateTable
CREATE TABLE "tipo_ato" (
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "sinonimos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tipo_ato_pkey" PRIMARY KEY ("codigo"),
    CONSTRAINT "tipo_ato_codigo_formato" CHECK ("codigo" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

-- CreateTable
CREATE TABLE "tabela_prazo" (
    "id" UUID NOT NULL,
    "tipo_ato" TEXT NOT NULL,
    "ramo" "ramo_processual" NOT NULL,
    "versao" INTEGER NOT NULL,
    "dias" INTEGER NOT NULL,
    "unidade" "unidade_prazo" NOT NULL,
    "fundamento" TEXT NOT NULL,
    "fonte_url" TEXT NOT NULL,
    "vigencia_inicio" DATE NOT NULL,
    "vigencia_fim" DATE,
    "status" "status_tabela_prazo" NOT NULL,
    "proposto_por" UUID NOT NULL,
    "proposto_em" TIMESTAMPTZ(6) NOT NULL,
    "aprovado_por" UUID,
    "aprovado_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tabela_prazo_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tabela_prazo_versao_positiva" CHECK ("versao" > 0),
    CONSTRAINT "tabela_prazo_dias_positivos" CHECK ("dias" > 0),
    CONSTRAINT "tabela_prazo_vigencia" CHECK ("vigencia_fim" IS NULL OR "vigencia_fim" >= "vigencia_inicio"),
    CONSTRAINT "tabela_prazo_aprovacao" CHECK (
      ("status" = 'rascunho' AND "aprovado_por" IS NULL AND "aprovado_em" IS NULL)
      OR ("status" = 'aprovado' AND "aprovado_por" IS NOT NULL AND "aprovado_em" IS NOT NULL
          AND "aprovado_por" <> "proposto_por")
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "tabela_prazo_tipo_ato_ramo_versao_key" ON "tabela_prazo"("tipo_ato", "ramo", "versao");

-- AddForeignKey
ALTER TABLE "tabela_prazo" ADD CONSTRAINT "tabela_prazo_tipo_ato_fkey" FOREIGN KEY ("tipo_ato") REFERENCES "tipo_ato"("codigo") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Só a transição rascunho → aprovado altera uma linha, e sem mexer no conteúdo proposto: o que
-- foi aprovado é exatamente o que foi revisado. Versão aprovada nunca muda nem é apagada.
CREATE FUNCTION pz_tabela_prazo_imutavel() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'rascunho' AND NEW.status = 'aprovado'
     AND (NEW.id, NEW.tipo_ato, NEW.ramo, NEW.versao, NEW.dias, NEW.unidade, NEW.fundamento,
          NEW.fonte_url, NEW.vigencia_inicio, NEW.vigencia_fim, NEW.proposto_por, NEW.proposto_em,
          NEW.criado_em)
         IS NOT DISTINCT FROM
         (OLD.id, OLD.tipo_ato, OLD.ramo, OLD.versao, OLD.dias, OLD.unidade, OLD.fundamento,
          OLD.fonte_url, OLD.vigencia_inicio, OLD.vigencia_fim, OLD.proposto_por, OLD.proposto_em,
          OLD.criado_em) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'tabela_prazo: % não permitido (versão aprovada é imutável; altere criando nova versão)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$;

CREATE TRIGGER "tabela_prazo_imutavel" BEFORE UPDATE OR DELETE ON "tabela_prazo"
  FOR EACH ROW EXECUTE FUNCTION pz_tabela_prazo_imutavel();

-- Globais (ADR-003): a api lê e o curador escreve pela transação do tenant plataforma.
GRANT SELECT, INSERT ON "tipo_ato" TO pz_app, pz_sistema;
GRANT SELECT, INSERT, UPDATE ON "tabela_prazo" TO pz_app, pz_sistema;
GRANT SELECT ON "tipo_ato", "tabela_prazo" TO pz_leitura;
