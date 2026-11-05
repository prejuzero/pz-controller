-- Anexo do envio manual apagado do armazenamento depois da retenção (PZ-362, HU32): o job diário
-- remove o arquivo e marca aqui. A linha do envio fica (situação e trilha).
ALTER TABLE "envio_manual" ADD COLUMN "anexo_removido_em" TIMESTAMPTZ(6);
CREATE INDEX "envio_manual_criado_em_anexo_pendente_idx" ON "envio_manual"("criado_em")
  WHERE "anexo_removido_em" IS NULL;
