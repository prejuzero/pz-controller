-- Curadoria das regras rápidas pelo portal (PZ-313): a curadora propõe uma versão (inativa) e
-- outra curadora a ativa (quatro olhos, como na tabela de prazos). Retirar desliga todas as
-- versões do código. A versão publicada continua imutável (trigger): só a ativação muda.
ALTER TABLE "regra_classificacao"
  ADD COLUMN "proposta_por" UUID,
  ADD COLUMN "ativada_por" UUID,
  ADD COLUMN "ativada_em" TIMESTAMPTZ(6),
  ADD COLUMN "retirada_em" TIMESTAMPTZ(6),
  ADD CONSTRAINT "regra_classificacao_quatro_olhos" CHECK (
    "ativada_por" IS NULL OR "proposta_por" IS NULL OR "ativada_por" <> "proposta_por"
  );

GRANT INSERT ON "regra_classificacao" TO pz_app;
GRANT UPDATE ("ativa", "ativada_por", "ativada_em", "retirada_em", "atualizado_em") ON "regra_classificacao" TO pz_app;
