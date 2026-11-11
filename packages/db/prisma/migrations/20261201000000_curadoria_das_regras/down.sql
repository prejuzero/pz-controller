-- Reverte 20261201000000_curadoria_das_regras.
REVOKE UPDATE ("ativa", "ativada_por", "ativada_em", "retirada_em", "atualizado_em") ON "regra_classificacao" FROM pz_app;
REVOKE INSERT ON "regra_classificacao" FROM pz_app;
ALTER TABLE "regra_classificacao"
  DROP CONSTRAINT "regra_classificacao_quatro_olhos",
  DROP COLUMN "retirada_em",
  DROP COLUMN "ativada_em",
  DROP COLUMN "ativada_por",
  DROP COLUMN "proposta_por";
