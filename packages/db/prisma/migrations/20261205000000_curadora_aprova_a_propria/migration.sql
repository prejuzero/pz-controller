-- A curadoria aprova o que ela mesma propôs (decisão do usuário em 11/11/2026: o projeto tem uma
-- curadora só). CLAUDE.md, seção 4.3, exige a aprovação do curador registrada com versão; quem
-- propôs, quem aprovou e quando continuam gravados na linha e na trilha de auditoria. Sai só a
-- exigência de uma segunda pessoa na tabela de prazos, no calendário global e nas regras rápidas.
ALTER TABLE "tabela_prazo" DROP CONSTRAINT "tabela_prazo_aprovacao";
ALTER TABLE "tabela_prazo" ADD CONSTRAINT "tabela_prazo_aprovacao" CHECK (
  ("status" = 'rascunho' AND "aprovado_por" IS NULL AND "aprovado_em" IS NULL)
  OR ("status" = 'aprovado' AND "aprovado_por" IS NOT NULL AND "aprovado_em" IS NOT NULL)
);
ALTER TABLE "evento_calendario" DROP CONSTRAINT "evento_calendario_aprovacao";
ALTER TABLE "evento_calendario" ADD CONSTRAINT "evento_calendario_aprovacao" CHECK (
  ("status" = 'rascunho' AND "aprovado_por" IS NULL AND "aprovado_em" IS NULL)
  OR ("status" = 'aprovado' AND "aprovado_por" IS NOT NULL AND "aprovado_em" IS NOT NULL)
);
ALTER TABLE "regra_classificacao" DROP CONSTRAINT "regra_classificacao_quatro_olhos";
