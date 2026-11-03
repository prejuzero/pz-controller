-- Controle de ciência (HU34, PZ-209): novo tipo de relatório e índice das notificações por prazo
-- (o relatório resume as notificações de até 5.000 prazos).
ALTER TABLE "relatorio" DROP CONSTRAINT "relatorio_tipo";
ALTER TABLE "relatorio" ADD CONSTRAINT "relatorio_tipo"
  CHECK ("tipo" IN ('agenda', 'busca-prazos', 'busca-publicacoes', 'controle-ciencia'));
CREATE INDEX "notificacao_tenant_id_prazo_id_idx" ON "notificacao"("tenant_id", "prazo_id");
