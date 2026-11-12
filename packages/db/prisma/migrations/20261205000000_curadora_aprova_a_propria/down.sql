-- Reverte 20261205000000_curadora_aprova_a_propria (falha se já houver aprovação pela própria
-- proponente: reverter exige antes revogar essas aprovações).
ALTER TABLE "regra_classificacao" ADD CONSTRAINT "regra_classificacao_quatro_olhos" CHECK (
  "ativada_por" IS NULL OR "proposta_por" IS NULL OR "ativada_por" <> "proposta_por"
);
ALTER TABLE "evento_calendario" DROP CONSTRAINT "evento_calendario_aprovacao";
ALTER TABLE "evento_calendario" ADD CONSTRAINT "evento_calendario_aprovacao" CHECK (
  ("status" = 'rascunho' AND "aprovado_por" IS NULL AND "aprovado_em" IS NULL)
  OR ("status" = 'aprovado' AND "aprovado_por" IS NOT NULL AND "aprovado_em" IS NOT NULL
      AND "aprovado_por" <> "proposto_por")
);
ALTER TABLE "tabela_prazo" DROP CONSTRAINT "tabela_prazo_aprovacao";
ALTER TABLE "tabela_prazo" ADD CONSTRAINT "tabela_prazo_aprovacao" CHECK (
  ("status" = 'rascunho' AND "aprovado_por" IS NULL AND "aprovado_em" IS NULL)
  OR ("status" = 'aprovado' AND "aprovado_por" IS NOT NULL AND "aprovado_em" IS NOT NULL
      AND "aprovado_por" <> "proposto_por")
);
