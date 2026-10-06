-- Checkpoint da verificação de integridade e da cópia WORM da auditoria (HU08, PZ-110): o
-- último elo conferido é a âncora que revela registros apagados do fim da cadeia.

-- CreateTable
CREATE TABLE "auditoria_verificacao" (
    "tenant_id" UUID NOT NULL,
    "ultima_sequencia" BIGINT NOT NULL,
    "ultimo_hash" TEXT NOT NULL,
    "ultima_exportada" BIGINT NOT NULL DEFAULT 0,
    "verificado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_verificacao_pkey" PRIMARY KEY ("tenant_id")
);

-- AddForeignKey
ALTER TABLE "auditoria_verificacao" ADD CONSTRAINT "auditoria_verificacao_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Isolamento por tenant (ADR-003).
SELECT pz_habilitar_rls('auditoria_verificacao');
