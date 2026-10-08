-- Saúde das fontes de publicações (HU19, ADR-005/011). Global e sem dado de cliente: uma linha
-- por fonte (ex.: djen), mantida pela execução da captura (papel sistema). Os escritórios só leem.
CREATE TYPE "situacao_fonte" AS ENUM ('operacional', 'degradada');

CREATE TABLE "fonte_captura" (
    "id" TEXT NOT NULL,
    "situacao" "situacao_fonte" NOT NULL DEFAULT 'operacional',
    -- Desde quando está na situação atual.
    "desde" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Falhas seguidas de captura que indicam a fonte fora do ar (zera no primeiro sucesso).
    "falhas_consecutivas" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fonte_captura_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fonte_captura_falhas" CHECK ("falhas_consecutivas" >= 0)
);

GRANT SELECT ON "fonte_captura" TO pz_app, pz_leitura;
GRANT SELECT, INSERT, UPDATE ON "fonte_captura" TO pz_sistema;
