-- Arquivo do relatório apagado depois que o link expira (PZ-353, HU29): o job diário remove o
-- arquivo do armazenamento e marca aqui, para não tentar de novo. A linha fica (histórico e trilha).
ALTER TABLE "relatorio" ADD COLUMN "arquivo_removido_em" TIMESTAMPTZ(6);
CREATE INDEX "relatorio_expira_em_pendente_remocao_idx" ON "relatorio"("expira_em")
  WHERE "situacao" = 'concluido' AND "arquivo_removido_em" IS NULL;
