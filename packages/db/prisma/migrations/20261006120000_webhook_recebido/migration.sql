-- Gateway de webhooks (HU09, ADR-005): corpo bruto dos webhooks de entrada, antes de saber o
-- tenant. Tabela global, sem tenant_id: a api (pz_app) só insere; o worker (sistema) processa.

-- CreateTable
CREATE TABLE "webhook_recebido" (
    "id" UUID NOT NULL,
    "adaptador" TEXT NOT NULL,
    "id_externo" TEXT NOT NULL,
    "cabecalhos" JSONB NOT NULL,
    "corpo" BYTEA NOT NULL,
    "recebido_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enfileirado_em" TIMESTAMPTZ(6),
    "processado_em" TIMESTAMPTZ(6),

    CONSTRAINT "webhook_recebido_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_recebido_adaptador_id_externo_key" ON "webhook_recebido"("adaptador", "id_externo");

-- Pendentes de enfileirar, na ordem de chegada.
CREATE INDEX "webhook_recebido_pendentes_idx" ON "webhook_recebido"("recebido_em") WHERE "enfileirado_em" IS NULL;

-- A api grava sem ler o corpo (pode ter dados pessoais); só o sistema lê e processa. O SELECT
-- nas colunas da chave única é exigido pelo ON CONFLICT da deduplicação.
GRANT INSERT ON "webhook_recebido" TO pz_app;
GRANT SELECT ("adaptador", "id_externo") ON "webhook_recebido" TO pz_app;
GRANT SELECT, UPDATE, DELETE ON "webhook_recebido" TO pz_sistema;
