-- Situação do envio manual por e-mail no portal (PZ-361, HU32). Um registro por envio, do
-- escritório (RLS). Sem os endereços (ficam na trilha): só a quantidade. "Enviado" e
-- "rejeitado" vêm da notificação vinculada; "falhou" é do preparo (recurso sumiu, todos os
-- destinatários suprimidos).
CREATE TABLE "envio_manual" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "recurso" TEXT NOT NULL,
    "destinatarios" INTEGER NOT NULL,
    "notificacao_id" UUID,
    "motivo_falha" TEXT,
    "falhou_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "envio_manual_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "envio_manual_recurso" CHECK ("recurso" IN ('prazo', 'publicacao', 'relatorio', 'busca')),
    CONSTRAINT "envio_manual_destinatarios" CHECK ("destinatarios" > 0),
    CONSTRAINT "envio_manual_falha" CHECK (("motivo_falha" IS NULL) = ("falhou_em" IS NULL))
);
CREATE INDEX "envio_manual_tenant_id_usuario_id_criado_em_idx" ON "envio_manual"("tenant_id", "usuario_id", "criado_em");
ALTER TABLE "envio_manual" ADD CONSTRAINT "envio_manual_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
SELECT pz_habilitar_rls('envio_manual');
