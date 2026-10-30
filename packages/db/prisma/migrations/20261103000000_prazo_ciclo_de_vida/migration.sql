-- Ciclo de vida do prazo (HU24, PZ-168/PZ-169).
-- * parametros: entrada do cálculo (ato, meio, referência, condições), para o ajuste recalcular
--   pelo motor sem pedir tudo de novo.
-- * classificacao_incerta: a classificação veio com confiança baixa ou de revisão manual (a tela
--   destaca; continua "a confirmar" como todo prazo).
-- * motivo_ajuste: último motivo de ajuste ou cancelamento (o histórico completo está na trilha).
-- * Um prazo por publicação recebida no tenant: a geração automática é idempotente.
ALTER TABLE "prazo" ADD COLUMN "parametros" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "prazo" ADD COLUMN "classificacao_incerta" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "prazo" ADD COLUMN "motivo_ajuste" TEXT;
CREATE UNIQUE INDEX "prazo_tenant_id_publicacao_conteudo_id_key" ON "prazo"("tenant_id", "publicacao_conteudo_id")
  WHERE "publicacao_conteudo_id" IS NOT NULL;
