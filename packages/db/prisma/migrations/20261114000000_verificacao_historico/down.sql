-- Reverte 20261114000000_verificacao_historico (históricos emitidos são apagados).
DELETE FROM "relatorio" WHERE "tipo" = 'historico-prazo';
ALTER TABLE "relatorio" DROP CONSTRAINT "relatorio_tipo";
ALTER TABLE "relatorio" ADD CONSTRAINT "relatorio_tipo"
  CHECK ("tipo" IN ('agenda', 'busca-prazos', 'busca-publicacoes', 'controle-ciencia'));
DROP TABLE IF EXISTS "verificacao_historico";
