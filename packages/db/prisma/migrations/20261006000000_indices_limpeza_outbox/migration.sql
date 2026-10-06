-- Limpeza do outbox (HU10): remove em lotes os eventos publicados e os registros de
-- processamento mais antigos que a retenção, sem varrer as tabelas inteiras a cada lote.

-- CreateIndex
CREATE INDEX "evento_processado_processado_em_idx" ON "evento_processado"("processado_em");

-- Só os publicados (os pendentes já têm o índice do relay).
CREATE INDEX "evento_dominio_publicados_idx" ON "evento_dominio"("publicado_em") WHERE "publicado_em" IS NOT NULL;
