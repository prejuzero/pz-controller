-- Casos candidatos à avaliação da IA a partir das correções dos advogados (HU22, PZ-162).
-- Global, sem tenant_id: guarda só o teor com dados pessoais minimizados e a correção, sem
-- dizer de qual escritório veio. Nada é apagado: a decisão do curador é estado.
CREATE TYPE "status_caso_candidato" AS ENUM ('pendente', 'aceito', 'descartado');

CREATE TABLE "caso_candidato_curadoria" (
    "id" UUID NOT NULL,
    "conteudo_id" UUID NOT NULL,
    "teor_anonimizado" TEXT NOT NULL,
    "tipo_ato_classificado" TEXT,
    "tipo_ato_corrigido" TEXT NOT NULL,
    "dias_citados" INTEGER,
    "dias_corrigidos" INTEGER,
    "status" "status_caso_candidato" NOT NULL DEFAULT 'pendente',
    "motivo_decisao" TEXT,
    "decidido_por" UUID,
    "decidido_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "caso_candidato_curadoria_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "caso_candidato_curadoria_decisao" CHECK (
      ("status" = 'pendente' AND "decidido_por" IS NULL AND "decidido_em" IS NULL AND "motivo_decisao" IS NULL)
      OR ("status" <> 'pendente' AND "decidido_por" IS NOT NULL AND "decidido_em" IS NOT NULL AND "motivo_decisao" IS NOT NULL)
    )
);

-- Uma correção igual (mesmo conteúdo, mesmo ato e dias) vira um caso só.
CREATE UNIQUE INDEX "caso_candidato_curadoria_correcao_key"
  ON "caso_candidato_curadoria"("conteudo_id", "tipo_ato_corrigido", COALESCE("dias_corrigidos", -1));
CREATE INDEX "caso_candidato_curadoria_status_idx" ON "caso_candidato_curadoria"("status", "id");

-- Global (ADR-003): o consumidor grava no tenant do evento; o curador decide no tenant plataforma.
GRANT SELECT, INSERT, UPDATE ON "caso_candidato_curadoria" TO pz_app, pz_sistema;
GRANT SELECT ON "caso_candidato_curadoria" TO pz_leitura;
